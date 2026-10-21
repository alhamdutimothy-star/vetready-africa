-- Dairy-only workflow over existing assessment and evidence identities. No professional rules or awards.
CREATE TABLE dairy_pilot_versions(
 assessment_version_id uuid PRIMARY KEY REFERENCES case_blueprints(assessment_version_id),
 pilot_key text NOT NULL UNIQUE CHECK(pilot_key='TRANSITION_FRESH_COW_V1'),
 supplied_evidence jsonb NOT NULL CHECK(jsonb_typeof(supplied_evidence)='array')
);
CREATE TABLE dairy_pilot_stages(
 assessment_version_id uuid NOT NULL REFERENCES dairy_pilot_versions(assessment_version_id),item_version_id uuid NOT NULL,
 response_categories text[] NOT NULL CHECK(cardinality(response_categories)>0 AND response_categories <@ ARRAY['observations','interpretation','assumptions','informationRequests','priorities','actions','monitoring','safety']::text[]),
 PRIMARY KEY(assessment_version_id,item_version_id),
 FOREIGN KEY(assessment_version_id,item_version_id) REFERENCES case_reasoning_steps(assessment_version_id,item_version_id)
);
CREATE TABLE dairy_pilot_guidance(
 assessment_version_id uuid NOT NULL,item_version_id uuid NOT NULL,rubric_criterion_id uuid NOT NULL,
 assessor_guidance text NOT NULL CHECK(length(assessor_guidance) BETWEEN 10 AND 2000),
 PRIMARY KEY(assessment_version_id,item_version_id,rubric_criterion_id),
 FOREIGN KEY(assessment_version_id,item_version_id) REFERENCES dairy_pilot_stages(assessment_version_id,item_version_id),
 FOREIGN KEY(rubric_criterion_id,item_version_id) REFERENCES rubric_criteria(id,item_version_id)
);
CREATE TRIGGER dairy_pilot_snapshot BEFORE INSERT OR UPDATE OR DELETE ON dairy_pilot_versions FOR EACH ROW EXECUTE FUNCTION case_metadata_guard();
CREATE TRIGGER dairy_pilot_stage_snapshot BEFORE INSERT OR UPDATE OR DELETE ON dairy_pilot_stages FOR EACH ROW EXECUTE FUNCTION case_metadata_guard();
CREATE TRIGGER dairy_pilot_guidance_snapshot BEFORE INSERT OR UPDATE OR DELETE ON dairy_pilot_guidance FOR EACH ROW EXECUTE FUNCTION case_metadata_guard();
CREATE FUNCTION dairy_pilot_delivery_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM dairy_pilot_versions WHERE assessment_version_id=NEW.id) AND NEW.status='DEMO' THEN
  IF NOT EXISTS(SELECT 1 FROM pathway_versions v JOIN pathways p ON p.id=v.pathway_id WHERE v.id=NEW.pathway_version_id AND p.code='DAIRY')
   OR EXISTS(SELECT 1 FROM case_reasoning_steps s WHERE s.assessment_version_id=NEW.id AND NOT EXISTS(SELECT 1 FROM dairy_pilot_stages d WHERE d.assessment_version_id=s.assessment_version_id AND d.item_version_id=s.item_version_id))
   OR EXISTS(SELECT 1 FROM assessment_blueprint b JOIN rubric_criteria r ON r.item_version_id=b.item_version_id WHERE b.assessment_version_id=NEW.id AND NOT EXISTS(SELECT 1 FROM dairy_pilot_guidance g WHERE g.assessment_version_id=NEW.id AND g.rubric_criterion_id=r.id))
  THEN RAISE EXCEPTION 'Complete dairy pilot snapshot required'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER dairy_pilot_delivery BEFORE UPDATE ON assessment_versions FOR EACH ROW EXECUTE FUNCTION dairy_pilot_delivery_guard();
-- Technical optimistic concurrency; canonical answers remain in candidate_responses.
CREATE TABLE dairy_pilot_response_revisions(
 attempt_id uuid NOT NULL,item_version_id uuid NOT NULL,revision integer NOT NULL CHECK(revision>0),
 PRIMARY KEY(attempt_id,item_version_id),FOREIGN KEY(attempt_id,item_version_id) REFERENCES candidate_responses(attempt_id,item_version_id)
);
CREATE FUNCTION dairy_pilot_response_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE categories text[];
BEGIN
 SELECT s.response_categories INTO categories FROM assessment_attempts a JOIN dairy_pilot_stages s ON s.assessment_version_id=a.assessment_version_id AND s.item_version_id=NEW.item_version_id WHERE a.id=NEW.attempt_id;
 IF categories IS NULL THEN RETURN NEW; END IF;
 IF jsonb_typeof(NEW.response)<>'object' OR NOT NEW.response ? 'reasoning' OR (NEW.response-'reasoning')<>'{}'::jsonb OR jsonb_typeof(NEW.response->'reasoning')<>'object' THEN RAISE EXCEPTION 'Structured pilot reasoning required'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(NEW.response->'reasoning') r WHERE NOT(r.key=ANY(categories)) OR jsonb_typeof(r.value)<>'string' OR length(r.value#>>'{}')>2000)
  OR NOT EXISTS(SELECT 1 FROM jsonb_each_text(NEW.response->'reasoning') r WHERE length(btrim(r.value))>0) THEN RAISE EXCEPTION 'Invalid pilot reasoning categories'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER dairy_pilot_response_shape BEFORE INSERT OR UPDATE ON candidate_responses FOR EACH ROW EXECUTE FUNCTION dairy_pilot_response_guard();
CREATE FUNCTION dairy_pilot_response_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM assessment_attempts a JOIN dairy_pilot_versions p ON p.assessment_version_id=a.assessment_version_id WHERE a.id=NEW.attempt_id)
  AND (TG_OP='INSERT' OR NEW.response IS DISTINCT FROM OLD.response) THEN
  INSERT INTO dairy_pilot_response_revisions VALUES(NEW.attempt_id,NEW.item_version_id,1) ON CONFLICT(attempt_id,item_version_id) DO UPDATE SET revision=dairy_pilot_response_revisions.revision+1;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER dairy_pilot_response_clock AFTER INSERT OR UPDATE ON candidate_responses FOR EACH ROW EXECUTE FUNCTION dairy_pilot_response_revision();
CREATE FUNCTION dairy_pilot_clock_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Response clock is generated'; END IF; RETURN NEW; END $$;
CREATE TRIGGER dairy_pilot_clock_generated BEFORE INSERT OR UPDATE ON dairy_pilot_response_revisions FOR EACH ROW EXECUTE FUNCTION dairy_pilot_clock_guard();
CREATE TRIGGER dairy_pilot_clock_fixed BEFORE DELETE ON dairy_pilot_response_revisions FOR EACH ROW EXECUTE FUNCTION append_only();

CREATE TABLE dairy_pilot_review_drafts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),attempt_id uuid NOT NULL REFERENCES assessment_attempts(id),assessor_id uuid NOT NULL REFERENCES users(id),
 revision integer NOT NULL CHECK(revision>0),decision text NOT NULL CHECK(decision IN ('DEVELOPMENT_FEEDBACK','MORE_EVIDENCE_REQUIRED')),
 feedback text NOT NULL CHECK(length(feedback)<=6000),observations jsonb NOT NULL CHECK(jsonb_typeof(observations)='array'),
 request_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(attempt_id,assessor_id,revision),UNIQUE(id,attempt_id,assessor_id)
);
CREATE FUNCTION dairy_pilot_draft_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_attempt assessment_attempts; last_revision integer;
BEGIN
 SELECT * INTO current_attempt FROM assessment_attempts WHERE id=NEW.attempt_id FOR UPDATE;
 IF current_attempt.status<>'SUBMITTED' OR current_attempt.assigned_assessor_id IS DISTINCT FROM NEW.assessor_id
  OR NOT EXISTS(SELECT 1 FROM dairy_pilot_versions WHERE assessment_version_id=current_attempt.assessment_version_id)
  OR EXISTS(SELECT 1 FROM candidate_profiles WHERE id=current_attempt.candidate_id AND user_id=NEW.assessor_id)
  OR NOT training_capability(NEW.assessor_id,'assessment:review') THEN RAISE EXCEPTION 'Assigned independent assessor required'; END IF;
 SELECT coalesce(max(revision),0) INTO last_revision FROM dairy_pilot_review_drafts WHERE attempt_id=NEW.attempt_id AND assessor_id=NEW.assessor_id;
 IF NEW.revision<>last_revision+1 THEN RAISE EXCEPTION 'Review revision conflict'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.observations) o WHERE
  jsonb_typeof(o) IS DISTINCT FROM 'object' OR NOT(o ?& ARRAY['rubricCriterionId','observation','comment']) OR (o-ARRAY['rubricCriterionId','observation','comment'])<>'{}'::jsonb
  OR NOT EXISTS(SELECT 1 FROM attempt_items t JOIN rubric_criteria r ON r.item_version_id=t.item_version_id WHERE t.attempt_id=NEW.attempt_id AND r.id::text=o->>'rubricCriterionId')
  OR jsonb_typeof(o->'comment')<>'string' OR length(o->>'comment')>2000
  OR (o->>'observation' IS NOT NULL AND o->>'observation' NOT IN ('DEMONSTRATED','NEEDS_DEVELOPMENT','UNASSESSABLE')))
  OR (SELECT count(*) FROM jsonb_array_elements(NEW.observations))<>(SELECT count(DISTINCT o->>'rubricCriterionId') FROM jsonb_array_elements(NEW.observations) o)
 THEN RAISE EXCEPTION 'Review criteria must belong to attempt'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER dairy_pilot_draft_valid BEFORE INSERT ON dairy_pilot_review_drafts FOR EACH ROW EXECUTE FUNCTION dairy_pilot_draft_guard();
CREATE TRIGGER dairy_pilot_draft_history BEFORE UPDATE OR DELETE ON dairy_pilot_review_drafts FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TABLE dairy_pilot_review_finalizations(
 review_id uuid PRIMARY KEY,attempt_id uuid NOT NULL,assessor_id uuid NOT NULL,draft_id uuid NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(review_id,attempt_id) REFERENCES assessor_reviews(id,attempt_id),
 FOREIGN KEY(draft_id,attempt_id,assessor_id) REFERENCES dairy_pilot_review_drafts(id,attempt_id,assessor_id)
);
CREATE FUNCTION dairy_pilot_final_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE draft dairy_pilot_review_drafts; reviewed assessor_reviews;
BEGIN
 SELECT * INTO draft FROM dairy_pilot_review_drafts WHERE id=NEW.draft_id;
 SELECT * INTO reviewed FROM assessor_reviews WHERE id=NEW.review_id;
 IF reviewed.assessor_id<>NEW.assessor_id OR reviewed.feedback<>draft.feedback OR length(btrim(draft.feedback))<10
  OR NOT training_capability(NEW.assessor_id,'assessment:review')
  OR NOT EXISTS(SELECT 1 FROM assessment_attempts a JOIN candidate_profiles p ON p.id=a.candidate_id WHERE a.id=NEW.attempt_id AND a.status='REVIEWED' AND a.assigned_assessor_id=NEW.assessor_id AND p.user_id<>NEW.assessor_id)
  OR jsonb_array_length(draft.observations)<>(SELECT count(*) FROM attempt_items t JOIN rubric_criteria r ON r.item_version_id=t.item_version_id WHERE t.attempt_id=NEW.attempt_id)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(draft.observations) o WHERE o->>'observation' IS NULL OR length(btrim(o->>'comment'))<3)
  OR EXISTS(SELECT 1 FROM dairy_pilot_review_drafts WHERE attempt_id=NEW.attempt_id AND assessor_id=NEW.assessor_id AND revision>draft.revision)
  OR (SELECT count(*) FROM rubric_observations WHERE review_id=NEW.review_id)<>jsonb_array_length(draft.observations)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(draft.observations) o WHERE NOT EXISTS(SELECT 1 FROM rubric_observations r WHERE r.review_id=NEW.review_id AND r.rubric_criterion_id::text=o->>'rubricCriterionId' AND r.observation=o->>'observation' AND r.comment=o->>'comment'))
 THEN RAISE EXCEPTION 'Final review must match preserved draft'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER dairy_pilot_final_valid BEFORE INSERT ON dairy_pilot_review_finalizations FOR EACH ROW EXECUTE FUNCTION dairy_pilot_final_guard();
CREATE TRIGGER dairy_pilot_final_fixed BEFORE UPDATE OR DELETE ON dairy_pilot_review_finalizations FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE FUNCTION dairy_pilot_review_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM assessment_attempts a JOIN dairy_pilot_versions p ON p.assessment_version_id=a.assessment_version_id WHERE a.id=NEW.attempt_id)
  AND NOT EXISTS(SELECT 1 FROM dairy_pilot_review_finalizations WHERE review_id=NEW.id)
 THEN RAISE EXCEPTION 'Pilot review requires draft finalization provenance'; END IF; RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER dairy_pilot_review_bound AFTER INSERT ON assessor_reviews DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dairy_pilot_review_binding();
