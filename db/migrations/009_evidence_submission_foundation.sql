-- Phase 3A: governed source/provenance foundation, NOT a competence-award workflow.
-- No existing rows, professional rules, role grants or authentication settings are rewritten.
CREATE TABLE evidence_submissions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 candidate_id uuid NOT NULL REFERENCES candidate_profiles(id),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,candidate_id)
);
CREATE TABLE evidence_submission_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 submission_id uuid NOT NULL,
 candidate_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0),
 previous_version_id uuid,
 pathway_version_id uuid NOT NULL REFERENCES pathway_versions(id),
 kind text NOT NULL CHECK(kind IN ('CANDIDATE_REPORT','SUPERVISED_TASK','WORKPLACE_RECORD','SIMULATION_RECORD')),
 summary text NOT NULL CHECK(length(btrim(summary)) BETWEEN 10 AND 4000),
 context jsonb NOT NULL CHECK(jsonb_typeof(context)='object' AND jsonb_typeof(context->'task')='string' AND length(btrim(context->>'task')) BETWEEN 1 AND 160 AND context ? 'task'),
 demo boolean NOT NULL,
 validation_notice text NOT NULL DEFAULT 'PROPOSED — REQUIRES DOMAIN EXPERT VALIDATION'
  CHECK(validation_notice='PROPOSED — REQUIRES DOMAIN EXPERT VALIDATION'),
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','NEEDS_REVISION','RESUBMITTED','VERIFIED','REJECTED','WITHDRAWN')),
 change_actor_id uuid NOT NULL REFERENCES users(id),
 change_reason text NOT NULL CHECK(length(btrim(change_reason)) BETWEEN 10 AND 500),
 change_request_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(submission_id,version), UNIQUE(id,candidate_id), UNIQUE(id,submission_id,candidate_id),
 FOREIGN KEY(submission_id,candidate_id) REFERENCES evidence_submissions(id,candidate_id),
 FOREIGN KEY(previous_version_id,submission_id,candidate_id) REFERENCES evidence_submission_versions(id,submission_id,candidate_id),
 CHECK((version=1 AND previous_version_id IS NULL) OR (version>1 AND previous_version_id IS NOT NULL))
);
CREATE TABLE evidence_submission_competencies(
 submission_version_id uuid NOT NULL,
 candidate_id uuid NOT NULL,
 child_version_id uuid NOT NULL REFERENCES child_competency_versions(id),
 requested_facet text NOT NULL CHECK(requested_facet IN ('SELF_DECLARED','DOCUMENT_VERIFIED','KNOWLEDGE_ASSESSED','CASE_ASSESSED','SIMULATION_VERIFIED','PRACTICALLY_VERIFIED','WORKPLACE_VERIFIED')),
 PRIMARY KEY(submission_version_id,child_version_id,requested_facet),
 UNIQUE(submission_version_id,candidate_id,child_version_id,requested_facet),
 FOREIGN KEY(submission_version_id,candidate_id) REFERENCES evidence_submission_versions(id,candidate_id)
);
-- Append-only transition provenance, not a second audit or competency ledger.
CREATE TABLE evidence_status_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 submission_version_id uuid NOT NULL REFERENCES evidence_submission_versions(id),
 actor_id uuid NOT NULL REFERENCES users(id),
 from_status text, to_status text NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 500),
 request_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(from_status IS NULL OR from_status<>to_status)
);
CREATE INDEX submission_owner_idx ON evidence_submissions(candidate_id,created_at DESC);
CREATE INDEX submission_versions_state_idx ON evidence_submission_versions(candidate_id,status);
CREATE INDEX submission_events_version_idx ON evidence_status_events(submission_version_id,created_at,id);

-- Scaffolding is explicitly PROPOSED. No record here grants professional authority.
CREATE TABLE assessor_profiles(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL UNIQUE REFERENCES users(id),
 proposed_by uuid NOT NULL REFERENCES users(id),
 status text NOT NULL DEFAULT 'PROPOSED' CHECK(status='PROPOSED'),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(user_id=proposed_by)
);
CREATE TABLE assessor_scope_grants(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 assessor_profile_id uuid NOT NULL REFERENCES assessor_profiles(id),
 pathway_version_id uuid NOT NULL REFERENCES pathway_versions(id),
 child_version_id uuid NOT NULL REFERENCES child_competency_versions(id),
 method text NOT NULL CHECK(method IN ('KNOWLEDGE','CASE','SIMULATION','PRACTICAL','WORKPLACE')),
 context_kind text NOT NULL CHECK(length(btrim(context_kind)) BETWEEN 1 AND 160),
 proposed_by uuid NOT NULL REFERENCES users(id),
 status text NOT NULL DEFAULT 'PROPOSED' CHECK(status='PROPOSED'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(assessor_profile_id,pathway_version_id,child_version_id,method,context_kind)
);

CREATE FUNCTION phase3_submission_owner_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM candidate_profiles p JOIN users u ON u.id=p.user_id WHERE p.id=NEW.candidate_id AND p.user_id=NEW.created_by AND u.status='ACTIVE') THEN
  RAISE EXCEPTION 'Active candidate owner required';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER submission_owner BEFORE INSERT ON evidence_submissions FOR EACH ROW EXECUTE FUNCTION phase3_submission_owner_guard();
CREATE TRIGGER submission_identity_immutable BEFORE UPDATE OR DELETE ON evidence_submissions FOR EACH ROW EXECUTE FUNCTION append_only();

CREATE FUNCTION phase3_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id uuid; latest evidence_submission_versions%ROWTYPE;
BEGIN
 SELECT s.created_by INTO owner_id FROM evidence_submissions s WHERE s.id=NEW.submission_id AND s.candidate_id=NEW.candidate_id FOR UPDATE;
 IF owner_id IS NULL OR owner_id<>NEW.change_actor_id OR NOT EXISTS(SELECT 1 FROM users WHERE id=owner_id AND status='ACTIVE') THEN RAISE EXCEPTION 'Active candidate owner required'; END IF;
 IF TG_OP='INSERT' THEN
  SELECT * INTO latest FROM evidence_submission_versions WHERE submission_id=NEW.submission_id ORDER BY version DESC LIMIT 1;
  IF NEW.status<>'DRAFT' THEN RAISE EXCEPTION 'New version must start DRAFT'; END IF;
  IF latest.id IS NULL THEN
   IF NEW.version<>1 OR NEW.previous_version_id IS NOT NULL THEN RAISE EXCEPTION 'Initial version must be one'; END IF;
  ELSIF latest.status<>'WITHDRAWN' OR NEW.version<>latest.version+1 OR NEW.previous_version_id IS DISTINCT FROM latest.id THEN
   RAISE EXCEPTION 'Revision requires latest withdrawn version';
  END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['summary','context','kind','demo','pathway_version_id','status','change_actor_id','change_reason','change_request_id']) <>
     (to_jsonb(OLD)-ARRAY['summary','context','kind','demo','pathway_version_id','status','change_actor_id','change_reason','change_request_id']) THEN RAISE EXCEPTION 'Version identity immutable'; END IF;
  IF OLD.status<>'DRAFT' AND (to_jsonb(NEW)-ARRAY['status','change_actor_id','change_reason','change_request_id']) <>
     (to_jsonb(OLD)-ARRAY['status','change_actor_id','change_reason','change_request_id']) THEN RAISE EXCEPTION 'Submitted version immutable'; END IF;
  IF NEW.status<>OLD.status THEN
   -- Submission locks its complete snapshot in this statement; edits and submit cannot be combined.
   IF (to_jsonb(NEW)-ARRAY['status','change_actor_id','change_reason','change_request_id']) <>
      (to_jsonb(OLD)-ARRAY['status','change_actor_id','change_reason','change_request_id']) THEN RAISE EXCEPTION 'Edit draft separately before transition'; END IF;
   IF NOT ((OLD.status='DRAFT' AND (NEW.status='WITHDRAWN' OR (NEW.version=1 AND NEW.status='SUBMITTED') OR (NEW.version>1 AND NEW.status='RESUBMITTED'))) OR
           (OLD.status IN ('SUBMITTED','RESUBMITTED') AND NEW.status='WITHDRAWN')) THEN RAISE EXCEPTION 'Invalid transition or review workflow not enabled'; END IF;
   IF NEW.status IN ('SUBMITTED','RESUBMITTED') AND NOT EXISTS(SELECT 1 FROM evidence_submission_competencies WHERE submission_version_id=NEW.id) THEN RAISE EXCEPTION 'Mapped child competency required'; END IF;
  ELSIF OLD.status<>'DRAFT' THEN RAISE EXCEPTION 'Submitted version immutable';
  END IF;
 END IF;
 -- A draft cannot move pathways after targets have been selected.
 IF EXISTS(SELECT 1 FROM evidence_submission_competencies m WHERE m.submission_version_id=NEW.id AND NOT EXISTS(
  SELECT 1 FROM child_group_mappings c JOIN pathway_competencies pc ON pc.competency_version_id=c.group_version_id WHERE c.child_version_id=m.child_version_id AND pc.pathway_version_id=NEW.pathway_version_id
 )) THEN RAISE EXCEPTION 'Target child must belong to pathway'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER submission_version_valid BEFORE INSERT OR UPDATE ON evidence_submission_versions FOR EACH ROW EXECUTE FUNCTION phase3_version_guard();
CREATE TRIGGER submission_version_no_delete BEFORE DELETE ON evidence_submission_versions FOR EACH ROW EXECUTE FUNCTION append_only();

CREATE FUNCTION phase3_mapping_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v evidence_submission_versions%ROWTYPE; row_version uuid;
BEGIN
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Replace draft mapping instead of updating identity'; END IF;
 IF TG_OP='DELETE' THEN row_version:=OLD.submission_version_id; ELSE row_version:=NEW.submission_version_id; END IF;
 SELECT * INTO v FROM evidence_submission_versions WHERE id=row_version FOR UPDATE;
 IF v.status IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Submitted mapping immutable'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.candidate_id<>v.candidate_id THEN RAISE EXCEPTION 'Candidate source mismatch'; END IF;
  IF NOT EXISTS(SELECT 1 FROM child_group_mappings m JOIN pathway_competencies pc ON pc.competency_version_id=m.group_version_id WHERE m.child_version_id=NEW.child_version_id AND pc.pathway_version_id=v.pathway_version_id) THEN RAISE EXCEPTION 'Target child must belong to pathway'; END IF;
  RETURN NEW;
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER submission_mapping_valid BEFORE INSERT OR UPDATE OR DELETE ON evidence_submission_competencies FOR EACH ROW EXECUTE FUNCTION phase3_mapping_guard();

-- Existing audit_events is the sole general audit log. Payloads/narratives are never copied into it.
CREATE FUNCTION phase3_submission_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='evidence_submissions' THEN
  INSERT INTO audit_events(actor_id,action,resource_type,resource_id) VALUES(NEW.created_by,'evidence.submission.created','evidence_submission',NEW.id);
 ELSE
  IF TG_OP='INSERT' OR NEW.status<>OLD.status THEN
   INSERT INTO evidence_status_events(submission_version_id,actor_id,from_status,to_status,reason,request_id)
    VALUES(NEW.id,NEW.change_actor_id,CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.status END,NEW.status,NEW.change_reason,NEW.change_request_id);
  END IF;
  INSERT INTO audit_events(actor_id,action,resource_type,resource_id,request_id,metadata)
   VALUES(NEW.change_actor_id,CASE WHEN TG_OP='INSERT' THEN 'evidence.version.created' WHEN NEW.status<>OLD.status THEN 'evidence.version.transitioned' ELSE 'evidence.draft.edited' END,
    'evidence_submission_version',NEW.id,NEW.change_request_id,jsonb_build_object('version',NEW.version,'status',NEW.status));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER submission_audited AFTER INSERT ON evidence_submissions FOR EACH ROW EXECUTE FUNCTION phase3_submission_audit();
CREATE TRIGGER submission_version_audited AFTER INSERT OR UPDATE ON evidence_submission_versions FOR EACH ROW EXECUTE FUNCTION phase3_submission_audit();
CREATE TRIGGER status_event_immutable BEFORE UPDATE OR DELETE ON evidence_status_events FOR EACH ROW EXECUTE FUNCTION append_only();

-- Optimistic expected-state check plus row locking. Future services derive actor_id from auth,
-- never from a client body. This is security-invoker; it grants no new database privileges.
CREATE FUNCTION transition_evidence_submission(target_version uuid, actor uuid, expected_state text, target_state text, reason text, request uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE current_state text;
BEGIN
 SELECT status INTO current_state FROM evidence_submission_versions WHERE id=target_version FOR UPDATE;
 IF NOT FOUND OR current_state<>expected_state THEN RAISE EXCEPTION 'Submission state conflict'; END IF;
 UPDATE evidence_submission_versions SET status=target_state,change_actor_id=actor,change_reason=reason,change_request_id=request WHERE id=target_version;
END $$;

CREATE FUNCTION phase3_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM assessor_profiles WHERE id=NEW.assessor_profile_id AND user_id=NEW.proposed_by) THEN RAISE EXCEPTION 'Assessor proposal owner required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM child_group_mappings m JOIN pathway_competencies pc ON pc.competency_version_id=m.group_version_id WHERE m.child_version_id=NEW.child_version_id AND pc.pathway_version_id=NEW.pathway_version_id) THEN RAISE EXCEPTION 'Scope child must belong to pathway'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assessor_scope_valid BEFORE INSERT ON assessor_scope_grants FOR EACH ROW EXECUTE FUNCTION phase3_scope_guard();
CREATE TRIGGER assessor_profile_immutable BEFORE UPDATE OR DELETE ON assessor_profiles FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER assessor_scope_immutable BEFORE UPDATE OR DELETE ON assessor_scope_grants FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE FUNCTION phase3_scope_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO audit_events(actor_id,action,resource_type,resource_id,metadata) VALUES(NEW.proposed_by,'assessor.proposal.created',TG_TABLE_NAME,NEW.id,jsonb_build_object('status','PROPOSED'));
 RETURN NEW;
END $$;
CREATE TRIGGER assessor_profile_audited AFTER INSERT ON assessor_profiles FOR EACH ROW EXECUTE FUNCTION phase3_scope_audit();
CREATE TRIGGER assessor_scope_audited AFTER INSERT ON assessor_scope_grants FOR EACH ROW EXECUTE FUNCTION phase3_scope_audit();

-- Typed extension of the existing canonical ledger; assessment rows retain their original source.
ALTER TABLE competency_evidence
 ADD COLUMN source_kind text NOT NULL DEFAULT 'ASSESSMENT' CHECK(source_kind IN ('ASSESSMENT','EXTERNAL_SUBMISSION')),
 ADD COLUMN submission_version_id uuid,
 ALTER COLUMN attempt_id DROP NOT NULL,
 ALTER COLUMN item_version_id DROP NOT NULL,
 DROP CONSTRAINT competency_evidence_facet_check;
ALTER TABLE competency_evidence
 ADD CONSTRAINT competency_evidence_facet_check CHECK(facet IN ('SELF_DECLARED','DOCUMENT_VERIFIED','KNOWLEDGE_ASSESSED','CASE_ASSESSED','SIMULATION_VERIFIED','PRACTICALLY_VERIFIED','WORKPLACE_VERIFIED')),
 ADD CONSTRAINT evidence_source_xor CHECK(
  (source_kind='ASSESSMENT' AND attempt_id IS NOT NULL AND item_version_id IS NOT NULL AND submission_version_id IS NULL AND facet IN ('KNOWLEDGE_ASSESSED','CASE_ASSESSED','SIMULATION_VERIFIED','PRACTICALLY_VERIFIED','WORKPLACE_VERIFIED')) OR
  (source_kind='EXTERNAL_SUBMISSION' AND attempt_id IS NULL AND item_version_id IS NULL AND submission_version_id IS NOT NULL)),
 ADD CONSTRAINT evidence_submission_provenance FOREIGN KEY(submission_version_id,candidate_id,child_version_id,facet)
  REFERENCES evidence_submission_competencies(submission_version_id,candidate_id,child_version_id,requested_facet),
 ADD CONSTRAINT unique_submission_child_facet UNIQUE(submission_version_id,child_version_id,facet);

-- Preserve the assessment branch from 004; isolate all external source behavior.
CREATE OR REPLACE FUNCTION phase2_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN

 IF NEW.source_kind='EXTERNAL_SUBMISSION' THEN
  IF NEW.status<>'UNVERIFIED' OR NEW.observation<>'REQUIRES_REVIEW' OR NEW.valid_until IS NOT NULL THEN RAISE EXCEPTION 'External verification workflow not enabled'; END IF;
  IF NOT EXISTS(SELECT 1 FROM evidence_submission_versions v WHERE v.id=NEW.submission_version_id AND v.candidate_id=NEW.candidate_id AND v.demo=NEW.demo AND v.context=NEW.context AND v.status IN ('SUBMITTED','RESUBMITTED')) THEN RAISE EXCEPTION 'Submitted source provenance required'; END IF;
  IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'External evidence receipt immutable'; END IF;
  RETURN NEW;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM assessment_attempts a JOIN assessment_versions v ON v.id=a.assessment_version_id JOIN assessment_blueprint b ON b.assessment_version_id=v.id JOIN assessment_item_versions i ON i.id=b.item_version_id WHERE a.id=NEW.attempt_id AND a.candidate_id=NEW.candidate_id AND b.item_version_id=NEW.item_version_id AND b.child_version_id=NEW.child_version_id AND i.evidence_type=NEW.facet AND v.demo=NEW.demo) THEN RAISE EXCEPTION 'Evidence provenance mismatch'; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['status','observation','valid_until'])<>(to_jsonb(OLD)-ARRAY['status','observation','valid_until']) THEN RAISE EXCEPTION 'Evidence provenance immutable'; END IF;
 IF NEW.status='VERIFIED' THEN
  IF NEW.demo OR NEW.facet IN ('PRACTICALLY_VERIFIED','WORKPLACE_VERIFIED','SIMULATION_VERIFIED') OR NEW.observation NOT IN ('CORRECT','DEMONSTRATED') THEN RAISE EXCEPTION 'Evidence not eligible for verification'; END IF;
  IF NOT EXISTS(SELECT 1 FROM child_competency_versions WHERE id=NEW.child_version_id AND validation_status='APPROVED') THEN RAISE EXCEPTION 'Validated child required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM competency_evidence_reviews WHERE evidence_id=NEW.id AND outcome='VERIFIED') THEN RAISE EXCEPTION 'Human verification decision required'; END IF;
 END IF;
 RETURN NEW;
END $$;

-- Preserve the latest-review/moderation requirements from 006 for assessment sources.
CREATE OR REPLACE FUNCTION phase2_verification_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.source_kind='EXTERNAL_SUBMISSION' THEN
  IF NEW.status<>'UNVERIFIED' THEN RAISE EXCEPTION 'External verification workflow not enabled'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.status='VERIFIED' THEN
  IF NOT EXISTS(SELECT 1 FROM assessment_attempts a JOIN assessment_versions av ON av.id=a.assessment_version_id JOIN assessment_item_versions i ON i.id=NEW.item_version_id WHERE a.id=NEW.attempt_id AND a.status='REVIEWED' AND av.status='APPROVED' AND i.validation_status='APPROVED') THEN RAISE EXCEPTION 'Approved content and human review required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM competency_evidence_reviews er JOIN assessment_attempts a ON a.id=NEW.attempt_id JOIN candidate_profiles p ON p.id=a.candidate_id WHERE er.evidence_id=NEW.id AND er.outcome='VERIFIED' AND er.reviewer_id=a.assigned_assessor_id AND er.reviewer_id<>p.user_id) THEN RAISE EXCEPTION 'Assigned independent assessor required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM assessment_moderations m JOIN assessor_reviews r ON r.id=m.review_id JOIN candidate_profiles p ON p.id=NEW.candidate_id WHERE r.attempt_id=NEW.attempt_id AND m.outcome='CONFIRMED' AND NOT EXISTS(SELECT 1 FROM assessor_reviews r2 WHERE r2.attempt_id=r.attempt_id AND (r2.created_at,r2.id)>(r.created_at,r.id)) AND m.moderator_id<>r.assessor_id AND m.moderator_id<>p.user_id AND NOT EXISTS(SELECT 1 FROM assessment_moderations later WHERE later.review_id=m.review_id AND later.created_at>m.created_at)) THEN RAISE EXCEPTION 'Independent moderation required'; END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION phase3_external_receipt_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor uuid; request uuid;
BEGIN
 IF NEW.source_kind='EXTERNAL_SUBMISSION' THEN
  SELECT change_actor_id,change_request_id INTO actor,request FROM evidence_submission_versions WHERE id=NEW.submission_version_id;
  INSERT INTO audit_events(actor_id,action,resource_type,resource_id,request_id,metadata)
   VALUES(actor,'evidence.receipt.created','competency_evidence',NEW.id,request,jsonb_build_object('sourceKind',NEW.source_kind,'status','UNVERIFIED'));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER external_receipt_audited AFTER INSERT ON competency_evidence FOR EACH ROW EXECUTE FUNCTION phase3_external_receipt_audit();

-- Transition provenance is generated by the version trigger, never inserted independently.
CREATE FUNCTION phase3_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Status events require governed version transition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER status_event_generated BEFORE INSERT ON evidence_status_events FOR EACH ROW EXECUTE FUNCTION phase3_event_guard();

CREATE FUNCTION phase3_mapping_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v evidence_submission_versions%ROWTYPE;
BEGIN
 SELECT * INTO v FROM evidence_submission_versions WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.submission_version_id ELSE NEW.submission_version_id END;
 INSERT INTO audit_events(actor_id,action,resource_type,resource_id,request_id,metadata)
 VALUES(v.change_actor_id,'evidence.draft.mapping.changed','evidence_submission_version',v.id,v.change_request_id,jsonb_build_object('operation',TG_OP));
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER submission_mapping_audited AFTER INSERT OR DELETE ON evidence_submission_competencies FOR EACH ROW EXECUTE FUNCTION phase3_mapping_audit();

-- References to submitted child definitions must keep the same meaning even if still PROPOSED.
CREATE FUNCTION phase3_referenced_child_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE child uuid; next_child uuid;
BEGIN
 IF TG_TABLE_NAME='child_competency_versions' THEN
  child:=OLD.id; next_child:=CASE WHEN TG_OP='UPDATE' THEN NEW.id ELSE OLD.id END;
 ELSE
  child:=OLD.child_version_id; next_child:=CASE WHEN TG_OP='UPDATE' THEN NEW.child_version_id ELSE OLD.child_version_id END;
 END IF;
 IF EXISTS(SELECT 1 FROM evidence_submission_competencies m JOIN evidence_submission_versions v ON v.id=m.submission_version_id WHERE m.child_version_id IN (child,next_child) AND v.status<>'DRAFT') THEN RAISE EXCEPTION 'Submitted child definition immutable; create new version'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER external_child_frozen BEFORE UPDATE OR DELETE ON child_competency_versions FOR EACH ROW EXECUTE FUNCTION phase3_referenced_child_guard();
CREATE TRIGGER external_criteria_frozen BEFORE UPDATE OR DELETE ON child_criteria FOR EACH ROW EXECUTE FUNCTION phase3_referenced_child_guard();
CREATE TRIGGER external_child_mapping_frozen BEFORE UPDATE OR DELETE ON child_group_mappings FOR EACH ROW EXECUTE FUNCTION phase3_referenced_child_guard();

-- AFTER INSERT permits no-op seed ON CONFLICT reruns but rejects additions to frozen meaning.
CREATE FUNCTION phase3_child_structure_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM evidence_submission_competencies m JOIN evidence_submission_versions v ON v.id=m.submission_version_id WHERE m.child_version_id=NEW.child_version_id AND v.status<>'DRAFT') THEN RAISE EXCEPTION 'Submitted child structure immutable; create new version'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER external_criteria_insert_frozen AFTER INSERT ON child_criteria FOR EACH ROW EXECUTE FUNCTION phase3_child_structure_insert_guard();
CREATE TRIGGER external_mapping_insert_frozen AFTER INSERT ON child_group_mappings FOR EACH ROW EXECUTE FUNCTION phase3_child_structure_insert_guard();

-- The existing final decision ledger must not accumulate external decisions before review exists.
CREATE FUNCTION phase3_external_decision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM competency_evidence WHERE id=NEW.evidence_id AND source_kind='EXTERNAL_SUBMISSION') THEN RAISE EXCEPTION 'External review workflow not enabled'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER external_decision_disabled BEFORE INSERT ON competency_evidence_reviews FOR EACH ROW EXECUTE FUNCTION phase3_external_decision_guard();
