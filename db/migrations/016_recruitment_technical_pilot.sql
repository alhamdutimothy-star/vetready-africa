-- Bounded technical pilot. No professional rules, weights or hiring decisions.
CREATE FUNCTION pilot16_govern(actor uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT training_capability(actor,'assessment:assign') AND EXISTS(SELECT 1 FROM user_role_assignments a WHERE a.user_id=actor AND a.role_code IN ('ADMIN','SUPER_ADMIN') AND a.role_scope='PLATFORM' AND a.organization_id IS NULL AND (a.expires_at IS NULL OR a.expires_at>now()));
$$;
CREATE TABLE pilot16_organizations(
 organization_id uuid PRIMARY KEY REFERENCES organizations(id),singleton boolean NOT NULL DEFAULT true UNIQUE CHECK(singleton),
 status text NOT NULL CHECK(status IN ('VERIFIED','SUSPENDED')),access_revision bigint NOT NULL DEFAULT 0 CHECK(access_revision>=0)
);
CREATE TABLE pilot16_employer_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 organization_id uuid NOT NULL REFERENCES pilot16_organizations(organization_id),actor_id uuid NOT NULL REFERENCES users(id),
 status text NOT NULL CHECK(status IN ('VERIFIED','SUSPENDED')),reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 500),request_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pilot16_member_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 organization_id uuid NOT NULL REFERENCES pilot16_organizations(organization_id),user_id uuid NOT NULL REFERENCES users(id),actor_id uuid NOT NULL REFERENCES users(id),
 status text NOT NULL CHECK(status IN ('ACTIVE','REVOKED')),reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 500),request_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,user_id) REFERENCES organization_memberships(organization_id,user_id)
);
CREATE FUNCTION pilot16_employer(actor uuid,org uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM users u JOIN organization_memberships m ON m.user_id=u.id JOIN user_role_assignments a ON a.user_id=u.id AND a.organization_id=m.organization_id JOIN role_permissions rp ON rp.role_code=a.role_code JOIN pilot16_organizations p ON p.organization_id=m.organization_id JOIN organizations o ON o.id=p.organization_id
 WHERE u.id=actor AND u.status='ACTIVE' AND m.organization_id=org AND a.role_scope='ORGANIZATION' AND rp.permission_code='employer:own' AND (a.expires_at IS NULL OR a.expires_at>now()) AND p.status='VERIFIED' AND o.verification_status='VERIFIED' AND coalesce((SELECT status FROM pilot16_member_events e WHERE e.organization_id=org AND e.user_id=actor ORDER BY sequence DESC LIMIT 1),'ACTIVE')='ACTIVE');
$$;
CREATE TABLE pilot16_policies(
 id text PRIMARY KEY CHECK(id='pilot-policy-1'),engine_version text NOT NULL CHECK(engine_version='pilot-match-1'),
 professional_status text NOT NULL CHECK(professional_status='UNCONFIGURED'),weighted_fit text NOT NULL CHECK(weighted_fit='UNCONFIGURED'),
 notice text NOT NULL CHECK(notice='REQUIRES DOMAIN EXPERT VALIDATION')
);
INSERT INTO pilot16_policies VALUES('pilot-policy-1','pilot-match-1','UNCONFIGURED','UNCONFIGURED','REQUIRES DOMAIN EXPERT VALIDATION');
CREATE TABLE pilot16_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES pilot16_organizations(organization_id),
 singleton boolean NOT NULL DEFAULT true UNIQUE CHECK(singleton),current_version integer,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED','CLOSED')),
 actor_id uuid NOT NULL REFERENCES users(id),request_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,organization_id)
);
CREATE TABLE pilot16_job_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),job_id uuid NOT NULL REFERENCES pilot16_jobs(id),version integer NOT NULL CHECK(version>0),
 pathway_version_id uuid NOT NULL REFERENCES pathway_versions(id),policy_id text NOT NULL DEFAULT 'pilot-policy-1' REFERENCES pilot16_policies(id),
 content jsonb NOT NULL CHECK(jsonb_typeof(content)='object'),actor_id uuid NOT NULL REFERENCES users(id),request_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(job_id,version),UNIQUE(id,job_id)
);
ALTER TABLE pilot16_jobs ADD FOREIGN KEY(id,current_version) REFERENCES pilot16_job_versions(job_id,version) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE pilot16_requirement_targets(
 job_version_id uuid NOT NULL REFERENCES pilot16_job_versions(id),requirement_id uuid NOT NULL,
 child_version_id uuid NOT NULL REFERENCES child_competency_versions(id),
 facet text NOT NULL CHECK(facet IN ('SELF_DECLARED','DOCUMENT_VERIFIED','KNOWLEDGE_ASSESSED','CASE_ASSESSED','SIMULATION_VERIFIED','PRACTICALLY_VERIFIED','WORKPLACE_VERIFIED')),
 PRIMARY KEY(job_version_id,requirement_id)
);
CREATE INDEX pilot16_requirement_child ON pilot16_requirement_targets(child_version_id);
CREATE FUNCTION pilot16_capture_targets() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO pilot16_requirement_targets(job_version_id,requirement_id,child_version_id,facet)
 SELECT NEW.id,(r->>'id')::uuid,(r->>'childVersionId')::uuid,r->>'facet' FROM jsonb_array_elements(NEW.content->'requirements') r WHERE r->>'kind'='COMPETENCY_FACET';RETURN NEW;
END $$;
CREATE TRIGGER pilot16_capture_targets AFTER INSERT ON pilot16_job_versions FOR EACH ROW EXECUTE FUNCTION pilot16_capture_targets();
CREATE TRIGGER pilot16_targets_immutable BEFORE UPDATE OR DELETE ON pilot16_requirement_targets FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE FUNCTION pilot16_child_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid;
BEGIN
 IF TG_TABLE_NAME='child_competency_versions' THEN target:=OLD.id;
 ELSIF TG_OP='INSERT' THEN target:=NEW.child_version_id;
 ELSE target:=OLD.child_version_id; END IF;
 IF EXISTS(SELECT 1 FROM pilot16_requirement_targets WHERE child_version_id=target) THEN RAISE EXCEPTION 'Job-referenced definition and pathway context require a new version'; END IF;
 IF TG_TABLE_NAME IN ('child_group_mappings','child_criteria') THEN
  IF TG_OP='UPDATE' THEN
   IF EXISTS(SELECT 1 FROM pilot16_requirement_targets WHERE child_version_id=NEW.child_version_id) THEN RAISE EXCEPTION 'Job-referenced pathway context requires a new version'; END IF;
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $$;
CREATE TRIGGER pilot16_child_frozen BEFORE UPDATE OR DELETE ON child_competency_versions FOR EACH ROW EXECUTE FUNCTION pilot16_child_frozen();
CREATE TRIGGER pilot16_mapping_frozen BEFORE UPDATE OR DELETE ON child_group_mappings FOR EACH ROW EXECUTE FUNCTION pilot16_child_frozen();
CREATE TRIGGER pilot16_mapping_insert_frozen AFTER INSERT ON child_group_mappings FOR EACH ROW EXECUTE FUNCTION pilot16_child_frozen();
CREATE TRIGGER pilot16_criteria_frozen BEFORE UPDATE OR DELETE ON child_criteria FOR EACH ROW EXECUTE FUNCTION pilot16_child_frozen();
CREATE TRIGGER pilot16_criteria_insert_frozen AFTER INSERT ON child_criteria FOR EACH ROW EXECUTE FUNCTION pilot16_child_frozen();
CREATE TABLE pilot16_job_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),job_id uuid NOT NULL REFERENCES pilot16_jobs(id),version_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),
 action text NOT NULL CHECK(action IN ('CREATED','REVISED','PUBLISHED','CLOSED')),request_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(version_id,job_id) REFERENCES pilot16_job_versions(id,job_id)
);
CREATE TABLE pilot16_applications(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),candidate_id uuid NOT NULL REFERENCES candidate_profiles(id),job_id uuid NOT NULL,job_version_id uuid NOT NULL,
 snapshot_id uuid NOT NULL REFERENCES competency_profile_snapshots(id),alias uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','WITHDRAWN')),stage text NOT NULL DEFAULT 'REVIEW' CHECK(stage IN ('REVIEW','SHORTLIST','REMOVE')),
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),actor_id uuid NOT NULL REFERENCES users(id),request_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(job_version_id,job_id) REFERENCES pilot16_job_versions(id,job_id)
);
CREATE UNIQUE INDEX pilot16_one_active_application ON pilot16_applications(candidate_id,job_id) WHERE status='ACTIVE';
CREATE TABLE pilot16_consent_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 application_id uuid NOT NULL REFERENCES pilot16_applications(id),actor_id uuid NOT NULL REFERENCES users(id),
 action text NOT NULL CHECK(action IN ('GIVEN','REVOKED')),terms_version text NOT NULL CHECK(terms_version='pilot-share-1'),
 request_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX pilot16_one_grant ON pilot16_consent_events(application_id) WHERE action='GIVEN';
CREATE TABLE pilot16_shares(
 application_id uuid PRIMARY KEY REFERENCES pilot16_applications(id),facts jsonb NOT NULL CHECK(jsonb_typeof(facts)='object'),facts_digest text NOT NULL CHECK(facts_digest ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pilot16_evaluations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),application_id uuid NOT NULL REFERENCES pilot16_applications(id),actor_id uuid NOT NULL REFERENCES users(id),
 policy_id text NOT NULL REFERENCES pilot16_policies(id),evaluated_at timestamptz NOT NULL DEFAULT now(),
 input jsonb NOT NULL,result jsonb NOT NULL,input_digest text NOT NULL CHECK(input_digest ~ '^[0-9a-f]{64}$'),result_digest text NOT NULL CHECK(result_digest ~ '^[0-9a-f]{64}$'),request_id uuid NOT NULL,
 UNIQUE(id,application_id)
);
CREATE TABLE pilot16_application_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),application_id uuid NOT NULL REFERENCES pilot16_applications(id),evaluation_id uuid,
 action text NOT NULL CHECK(action IN ('APPLIED','WITHDRAWN','REVIEW','SHORTLIST','REMOVE')),revision integer NOT NULL CHECK(revision>=0),actor_id uuid NOT NULL REFERENCES users(id),request_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(application_id,revision),FOREIGN KEY(evaluation_id,application_id) REFERENCES pilot16_evaluations(id,application_id)
);
CREATE TABLE pilot16_commands(
 actor_id uuid NOT NULL REFERENCES users(id),command_id uuid NOT NULL,scope text NOT NULL,request_digest text NOT NULL CHECK(request_digest ~ '^[0-9a-f]{64}$'),
 response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor_id,command_id)
);
CREATE INDEX pilot16_job_org ON pilot16_jobs(organization_id,status,id);
CREATE INDEX pilot16_candidate_applications ON pilot16_applications(candidate_id,created_at DESC,id);
CREATE INDEX pilot16_job_applications ON pilot16_applications(job_id,created_at DESC,id);
CREATE INDEX pilot16_consent_current ON pilot16_consent_events(application_id,sequence DESC);
CREATE INDEX pilot16_member_current ON pilot16_member_events(organization_id,user_id,sequence DESC);
CREATE INDEX pilot16_application_evaluations ON pilot16_evaluations(application_id,evaluated_at DESC,id);
CREATE FUNCTION pilot16_access(app uuid,actor uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM pilot16_applications a JOIN pilot16_jobs j ON j.id=a.job_id JOIN candidate_profiles p ON p.id=a.candidate_id JOIN users u ON u.id=p.user_id WHERE a.id=app AND a.status='ACTIVE' AND u.status='ACTIVE' AND training_capability(p.user_id,'candidate:own') AND pilot16_employer(actor,j.organization_id) AND (SELECT action FROM pilot16_consent_events WHERE application_id=a.id ORDER BY sequence DESC LIMIT 1)='GIVEN');
$$;
CREATE FUNCTION pilot16_json_safe(v jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE k text;x jsonb;
BEGIN
 IF jsonb_typeof(v)='object' THEN
  FOR k,x IN SELECT * FROM jsonb_each(v) LOOP
   IF NOT k=ANY(ARRAY['engineVersion','policyVersion','jobVersionId','pathwayVersionId','requirements','facts','pathwayInterest','state','willingToRelocate','facets','childVersionId','facet','sources','ref','kind','sourceVersionId','sourceVersion','pathwayVersionIds','recordedAt','validUntil','id','mandatory','acceptRelocation','scope','notice','eligibility','gates','requirementId','outcome','reason','sourceRefs','fit','status','score','weights','professionalReadiness','certification','licensing']) OR NOT pilot16_json_safe(x) THEN RETURN false; END IF;
  END LOOP;
 ELSIF jsonb_typeof(v)='array' THEN FOR x IN SELECT * FROM jsonb_array_elements(v) LOOP IF NOT pilot16_json_safe(x) THEN RETURN false; END IF; END LOOP;
 END IF;RETURN true;
END $$;
CREATE FUNCTION pilot16_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id uuid;org uuid;entry jsonb;
BEGIN
 IF TG_TABLE_NAME IN ('pilot16_employer_events','pilot16_member_events') THEN
  IF NOT pilot16_govern(NEW.actor_id) THEN RAISE EXCEPTION 'Pilot governance capability required'; END IF;
  IF TG_TABLE_NAME='pilot16_employer_events' AND EXISTS(SELECT 1 FROM organization_memberships WHERE organization_id=NEW.organization_id AND user_id=NEW.actor_id) THEN RAISE EXCEPTION 'Independent employer review required'; END IF;
 ELSIF TG_TABLE_NAME='pilot16_jobs' THEN
  IF NOT pilot16_employer(NEW.actor_id,NEW.organization_id) THEN RAISE EXCEPTION 'Active pilot employer required'; END IF;
  IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.created_at<>OLD.created_at OR NEW.current_version<OLD.current_version) THEN RAISE EXCEPTION 'Job identity/version immutable'; END IF;
 ELSIF TG_TABLE_NAME='pilot16_job_versions' THEN
  SELECT organization_id INTO org FROM pilot16_jobs WHERE id=NEW.job_id;
  IF NOT pilot16_employer(NEW.actor_id,org) THEN RAISE EXCEPTION 'Active pilot employer required'; END IF;
  IF NEW.content->>'pathwayVersionId' IS DISTINCT FROM NEW.pathway_version_id::text OR jsonb_typeof(NEW.content->'requirements') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.content->'requirements') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Version-bound requirements required'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(NEW.content) k WHERE k NOT IN ('title','description','pathwayVersionId','requirements')) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.content->'requirements') r WHERE r->'mandatory'='true'::jsonb) OR (SELECT count(DISTINCT r->>'id') FROM jsonb_array_elements(NEW.content->'requirements') r)<>jsonb_array_length(NEW.content->'requirements') THEN RAISE EXCEPTION 'Explicit unique mandatory requirements required'; END IF;
  FOR entry IN SELECT * FROM jsonb_array_elements(NEW.content->'requirements') LOOP
   PERFORM (entry->>'id')::uuid;
   IF jsonb_typeof(entry->'mandatory') IS DISTINCT FROM 'boolean' OR EXISTS(SELECT 1 FROM jsonb_object_keys(entry) k WHERE k NOT IN ('id','kind','mandatory','state','acceptRelocation','childVersionId','facet')) THEN RAISE EXCEPTION 'Unsupported requirement field'; END IF;
   IF entry->>'kind' IS NULL OR entry->>'kind' NOT IN ('COMPETENCY_FACET','LOCATION_DECLARATION','PATHWAY_INTEREST') THEN RAISE EXCEPTION 'Unsupported requirement'; END IF;
   IF entry->>'kind'='COMPETENCY_FACET' AND entry->>'facet' NOT IN ('SELF_DECLARED','DOCUMENT_VERIFIED','KNOWLEDGE_ASSESSED','CASE_ASSESSED','SIMULATION_VERIFIED','PRACTICALLY_VERIFIED','WORKPLACE_VERIFIED') THEN RAISE EXCEPTION 'Independent evidence facet required'; END IF;
   IF entry->>'kind'='COMPETENCY_FACET' AND NOT EXISTS(SELECT 1 FROM child_group_mappings m JOIN pathway_competencies pc ON pc.competency_version_id=m.group_version_id WHERE m.child_version_id=(entry->>'childVersionId')::uuid AND pc.pathway_version_id=NEW.pathway_version_id) THEN RAISE EXCEPTION 'Version/pathway target mismatch'; END IF;
  END LOOP;
 ELSIF TG_TABLE_NAME='pilot16_applications' THEN
  SELECT user_id INTO owner_id FROM candidate_profiles WHERE id=NEW.candidate_id;
  IF TG_OP='INSERT' THEN
   IF NEW.actor_id<>owner_id OR NOT training_capability(owner_id,'candidate:own') OR NOT EXISTS(SELECT 1 FROM competency_profile_snapshots WHERE id=NEW.snapshot_id AND candidate_id=NEW.candidate_id) THEN RAISE EXCEPTION 'Owner snapshot required'; END IF;
   IF NEW.status<>'ACTIVE' OR NEW.stage<>'REVIEW' OR NEW.revision<>0 THEN RAISE EXCEPTION 'Initial human review required'; END IF;
   IF NOT EXISTS(SELECT 1 FROM pilot16_jobs j JOIN pilot16_job_versions v ON v.job_id=j.id AND v.version=j.current_version WHERE j.id=NEW.job_id AND v.id=NEW.job_version_id AND j.status='PUBLISHED' AND EXISTS(SELECT 1 FROM pilot16_organizations o JOIN organizations org ON org.id=o.organization_id WHERE o.organization_id=j.organization_id AND o.status='VERIFIED' AND org.verification_status='VERIFIED')) THEN RAISE EXCEPTION 'Published pilot job required'; END IF;
  ELSE
   IF (to_jsonb(NEW)-ARRAY['status','stage','revision','actor_id','request_id'])<>(to_jsonb(OLD)-ARRAY['status','stage','revision','actor_id','request_id']) OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Immutable application identity or stale revision'; END IF;
   IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.actor_id<>owner_id OR NOT training_capability(owner_id,'candidate:own') OR OLD.status<>'ACTIVE' OR NEW.status<>'WITHDRAWN' OR NEW.stage<>OLD.stage THEN RAISE EXCEPTION 'Owner withdrawal only'; END IF;
   ELSIF NOT pilot16_access(NEW.id,NEW.actor_id) THEN RAISE EXCEPTION 'Current candidate consent required'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='pilot16_consent_events' THEN
  SELECT p.user_id INTO owner_id FROM pilot16_applications a JOIN candidate_profiles p ON p.id=a.candidate_id WHERE a.id=NEW.application_id;
  IF NEW.actor_id<>owner_id OR NOT training_capability(owner_id,'candidate:own') THEN RAISE EXCEPTION 'Candidate consent owner required'; END IF;
  IF NEW.action='GIVEN' AND EXISTS(SELECT 1 FROM pilot16_consent_events WHERE application_id=NEW.application_id) THEN RAISE EXCEPTION 'New application required after revocation'; END IF;
 ELSIF TG_TABLE_NAME='pilot16_shares' THEN
  IF NOT pilot16_json_safe(NEW.facts) OR NEW.facts_digest<>encode(sha256(convert_to(profile15_canonical(NEW.facts),'UTF8')),'hex') THEN RAISE EXCEPTION 'Share field or digest mismatch'; END IF;
 ELSIF TG_TABLE_NAME='pilot16_evaluations' THEN
  IF NOT pilot16_access(NEW.application_id,NEW.actor_id) THEN RAISE EXCEPTION 'Scoped access required'; END IF;
  IF NOT pilot16_json_safe(NEW.input) OR NOT pilot16_json_safe(NEW.result) OR NEW.input->>'policyVersion' IS DISTINCT FROM NEW.policy_id OR NEW.result->>'policyVersion' IS DISTINCT FROM NEW.policy_id OR NEW.input->>'engineVersion' IS DISTINCT FROM 'pilot-match-1' OR NEW.result->>'engineVersion' IS DISTINCT FROM 'pilot-match-1' THEN RAISE EXCEPTION 'Evaluation contract mismatch'; END IF;
  IF NEW.result->'fit'->>'status' IS DISTINCT FROM 'UNCONFIGURED' OR NEW.result->'fit'->'score' IS DISTINCT FROM 'null'::jsonb OR NEW.result->'fit'->'weights' IS DISTINCT FROM 'null'::jsonb OR NEW.result->>'professionalReadiness' IS DISTINCT FROM 'UNAVAILABLE' OR NEW.result->'certification' IS DISTINCT FROM 'null'::jsonb OR NEW.result->'licensing' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Professional decisions disabled'; END IF;
  IF NEW.input_digest<>encode(sha256(convert_to(profile15_canonical(NEW.input),'UTF8')),'hex') OR NEW.result_digest<>encode(sha256(convert_to(profile15_canonical(NEW.result),'UTF8')),'hex') THEN RAISE EXCEPTION 'Evaluation digest mismatch'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pilot16_applications a WHERE a.id=NEW.application_id AND a.job_version_id=(NEW.input->>'jobVersionId')::uuid AND a.job_version_id=(NEW.result->>'jobVersionId')::uuid) THEN RAISE EXCEPTION 'Evaluation job version mismatch'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pilot16_applications a JOIN pilot16_job_versions v ON v.id=a.job_version_id WHERE a.id=NEW.application_id AND v.policy_id=NEW.policy_id AND v.content->'requirements'=NEW.input->'requirements' AND v.pathway_version_id=(NEW.input->>'pathwayVersionId')::uuid) THEN RAISE EXCEPTION 'Locked requirement provenance mismatch'; END IF;
 ELSIF TG_TABLE_NAME='pilot16_application_events' THEN
  IF NEW.action IN ('REVIEW','SHORTLIST','REMOVE') AND NOT pilot16_access(NEW.application_id,NEW.actor_id) THEN RAISE EXCEPTION 'Scoped access required'; END IF;
  IF NEW.action='SHORTLIST' AND NOT EXISTS(SELECT 1 FROM pilot16_evaluations e WHERE e.id=NEW.evaluation_id AND e.application_id=NEW.application_id AND e.result->>'eligibility'='ELIGIBLE') THEN RAISE EXCEPTION 'Technical mandatory gates must be met'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION pilot16_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE resource uuid;
BEGIN
 resource:=(to_jsonb(NEW)->>'id')::uuid;
 INSERT INTO audit_events(actor_id,action,resource_type,resource_id,request_id,metadata) VALUES(NEW.actor_id,'recruitment.'||TG_TABLE_NAME||'.'||lower(TG_OP),'technical_pilot',resource,NEW.request_id,'{"mode":"TECHNICAL_PILOT"}');RETURN NEW;
END $$;
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['pilot16_employer_events','pilot16_member_events','pilot16_job_versions','pilot16_job_events','pilot16_consent_events','pilot16_evaluations','pilot16_application_events'] LOOP
  EXECUTE format('CREATE TRIGGER pilot16_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION append_only()',t);
  EXECUTE format('CREATE TRIGGER pilot16_audited AFTER INSERT ON %I FOR EACH ROW EXECUTE FUNCTION pilot16_audit()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['pilot16_employer_events','pilot16_member_events','pilot16_job_versions','pilot16_consent_events','pilot16_shares','pilot16_evaluations','pilot16_application_events'] LOOP
  EXECUTE format('CREATE TRIGGER pilot16_valid BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION pilot16_guard()',t);
 END LOOP;
END $$;
CREATE TRIGGER pilot16_job_valid BEFORE INSERT OR UPDATE ON pilot16_jobs FOR EACH ROW EXECUTE FUNCTION pilot16_guard();
CREATE TRIGGER pilot16_application_valid BEFORE INSERT OR UPDATE ON pilot16_applications FOR EACH ROW EXECUTE FUNCTION pilot16_guard();
CREATE TRIGGER pilot16_application_no_delete BEFORE DELETE ON pilot16_applications FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER pilot16_job_no_delete BEFORE DELETE ON pilot16_jobs FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER pilot16_share_immutable BEFORE UPDATE OR DELETE ON pilot16_shares FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER pilot16_policy_immutable BEFORE UPDATE OR DELETE ON pilot16_policies FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER pilot16_commands_immutable BEFORE UPDATE OR DELETE ON pilot16_commands FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE FUNCTION pilot16_application_complete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pilot16_application_events e WHERE e.application_id=NEW.id AND e.revision=NEW.revision AND e.actor_id=NEW.actor_id AND e.request_id=NEW.request_id AND e.action=CASE WHEN TG_OP='INSERT' THEN 'APPLIED' WHEN NEW.status='WITHDRAWN' THEN 'WITHDRAWN' ELSE NEW.stage END) THEN RAISE EXCEPTION 'Atomic application audit event required'; END IF;
 IF TG_OP='INSERT' AND (NOT EXISTS(SELECT 1 FROM pilot16_consent_events WHERE application_id=NEW.id AND action='GIVEN') OR NOT EXISTS(SELECT 1 FROM pilot16_shares WHERE application_id=NEW.id)) THEN RAISE EXCEPTION 'Atomic explicit consent and projection required'; END IF;
 IF NEW.status='WITHDRAWN' AND (SELECT action FROM pilot16_consent_events WHERE application_id=NEW.id ORDER BY sequence DESC LIMIT 1) IS DISTINCT FROM 'REVOKED' THEN RAISE EXCEPTION 'Withdrawal must revoke future access'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER pilot16_application_complete AFTER INSERT OR UPDATE ON pilot16_applications DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pilot16_application_complete();
