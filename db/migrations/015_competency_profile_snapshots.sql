-- Historical calculation receipts only. Existing evidence remains authoritative.
CREATE FUNCTION profile15_canonical(value jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE result text;
BEGIN
 IF jsonb_typeof(value)='object' THEN
  SELECT '{'||coalesce(string_agg(to_jsonb(k)::text||':'||profile15_canonical(v),',' ORDER BY k COLLATE "C"),'')||'}' INTO result FROM jsonb_each(value) AS e(k,v);
 ELSIF jsonb_typeof(value)='array' THEN
  SELECT '['||coalesce(string_agg(profile15_canonical(v),',' ORDER BY n),'')||']' INTO result FROM jsonb_array_elements(value) WITH ORDINALITY AS e(v,n);
 ELSE result:=value::text; END IF;
 RETURN result;
END $$;
CREATE FUNCTION profile15_safe_keys(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE k text; v jsonb;
BEGIN
 IF jsonb_typeof(value)='object' THEN
  FOR k,v IN SELECT * FROM jsonb_each(value) LOOP
   IF NOT k=ANY(ARRAY['engineVersion','evaluatedAt','pathways','groups','competencies','requirements','sources','state','id','pathwayId','code','name','version','status','statement','validationStatus','groupVersionIds','pathwayVersionIds','pathwayVersionId','childVersionId','facets','mandatory','key','kind','targets','facet','groupFacet','lifecycle','demo','observation','sourceVersionId','sourceVersion','lineageId','decisionId','decisionOutcome','decisionAt','reviewerRef','recordedAt','validUntil','verificationSupported','reviewPending','completedLessons','totalLessons','notice','configurationStatus','readiness','determination','reason','certification','licensing','reservedStates','highestVerifiedFacet','learningSourceKeys','groupSupportingSourceKeys','gaps','requirementValidationStatus','proposedFacets','unverifiedFacets','reasons','sourceKeys','effectiveSourceKeys','selectedSourceKey','disposition','effective','groupEvidence','groupVersionId','sharingEnabled']) OR NOT profile15_safe_keys(v) THEN RETURN false; END IF;
  END LOOP;
 ELSIF jsonb_typeof(value)='array' THEN
  FOR v IN SELECT * FROM jsonb_array_elements(value) LOOP IF NOT profile15_safe_keys(v) THEN RETURN false; END IF; END LOOP;
 END IF;
 RETURN true;
END $$;
CREATE TABLE competency_profile_snapshots(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 candidate_id uuid NOT NULL REFERENCES candidate_profiles(id),
 actor_id uuid NOT NULL REFERENCES users(id),
 command_id uuid NOT NULL,request_id uuid NOT NULL,
 engine_version text NOT NULL CHECK(engine_version='competency-profile-1'),
 evaluated_at timestamptz NOT NULL,
 input_facts jsonb NOT NULL CHECK(jsonb_typeof(input_facts)='object'),
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 input_digest text NOT NULL CHECK(input_digest ~ '^[0-9a-f]{64}$'),
 result_digest text NOT NULL CHECK(result_digest ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(candidate_id,command_id)
);
CREATE INDEX competency_profile_snapshot_owner ON competency_profile_snapshots(candidate_id,created_at DESC,id);
CREATE FUNCTION profile15_snapshot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fact_source jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM candidate_profiles p WHERE p.id=NEW.candidate_id AND p.user_id=NEW.actor_id) OR NOT training_capability(NEW.actor_id,'candidate:own') THEN RAISE EXCEPTION 'Profile snapshot active owner required'; END IF;
 IF NEW.input_facts->>'engineVersion' IS DISTINCT FROM NEW.engine_version OR NEW.result->>'engineVersion' IS DISTINCT FROM NEW.engine_version OR (NEW.input_facts->>'evaluatedAt')::timestamptz IS DISTINCT FROM NEW.evaluated_at OR NEW.result->>'evaluatedAt' IS DISTINCT FROM NEW.input_facts->>'evaluatedAt' THEN RAISE EXCEPTION 'Profile snapshot version or time mismatch'; END IF;
 IF NEW.result->>'configurationStatus' IS DISTINCT FROM 'UNCONFIGURED' OR NEW.result->'readiness'->>'status' IS DISTINCT FROM 'UNAVAILABLE' OR NEW.result->'readiness'->'determination' IS DISTINCT FROM 'null'::jsonb OR NEW.result->'readiness'->'certification' IS DISTINCT FROM 'null'::jsonb OR NEW.result->'readiness'->'licensing' IS DISTINCT FROM 'null'::jsonb OR NEW.result->'sharingEnabled' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'Profile professional decisions unavailable'; END IF;
 IF NOT profile15_safe_keys(NEW.input_facts) OR NOT profile15_safe_keys(NEW.result) THEN RAISE EXCEPTION 'Profile snapshot private or unsupported field'; END IF;
 FOR fact_source IN SELECT * FROM jsonb_array_elements(NEW.input_facts->'sources') LOOP
  IF fact_source->>'kind' IN ('ASSESSMENT','EXTERNAL_SUBMISSION') THEN
   IF NOT EXISTS(SELECT 1 FROM competency_evidence e WHERE e.id=(fact_source->>'id')::uuid AND e.candidate_id=NEW.candidate_id AND e.source_kind=fact_source->>'kind') THEN RAISE EXCEPTION 'Profile snapshot evidence provenance mismatch'; END IF;
  ELSIF fact_source->>'kind'='LEGACY_GROUP' THEN
   IF NOT EXISTS(SELECT 1 FROM evidence_records e WHERE e.id=(fact_source->>'id')::uuid AND e.candidate_id=NEW.candidate_id) THEN RAISE EXCEPTION 'Profile snapshot legacy provenance mismatch'; END IF;
  ELSIF fact_source->>'kind'='LEARNING' THEN
   IF NOT EXISTS(SELECT 1 FROM training_enrollments e WHERE e.id=(fact_source->>'id')::uuid AND e.candidate_id=NEW.candidate_id AND e.course_version_id=(fact_source->>'sourceVersionId')::uuid) THEN RAISE EXCEPTION 'Profile snapshot learning provenance mismatch'; END IF;
  ELSIF fact_source->>'kind'='PRACTICAL_DRAFT' THEN
   IF NOT EXISTS(SELECT 1 FROM evidence_submission_versions e WHERE e.id=(fact_source->>'id')::uuid AND e.candidate_id=NEW.candidate_id) THEN RAISE EXCEPTION 'Profile snapshot submission provenance mismatch'; END IF;
  ELSE RAISE EXCEPTION 'Profile snapshot unsupported source'; END IF;
 END LOOP;
 IF NEW.input_digest<>encode(sha256(convert_to(profile15_canonical(NEW.input_facts),'UTF8')),'hex') OR NEW.result_digest<>encode(sha256(convert_to(profile15_canonical(NEW.result),'UTF8')),'hex') THEN RAISE EXCEPTION 'Profile snapshot digest mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION profile15_snapshot_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO audit_events(actor_id,action,resource_type,resource_id,request_id,metadata)
 VALUES(NEW.actor_id,'competency.profile.snapshot.created','competency_profile_snapshot',NEW.id,NEW.request_id,jsonb_build_object('engineVersion',NEW.engine_version,'inputDigest',NEW.input_digest,'resultDigest',NEW.result_digest));
 RETURN NEW;
END $$;
CREATE TRIGGER profile_snapshot_valid BEFORE INSERT ON competency_profile_snapshots FOR EACH ROW EXECUTE FUNCTION profile15_snapshot_guard();
CREATE TRIGGER profile_snapshot_immutable BEFORE UPDATE OR DELETE ON competency_profile_snapshots FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER profile_snapshot_audited AFTER INSERT ON competency_profile_snapshots FOR EACH ROW EXECUTE FUNCTION profile15_snapshot_audit();
