-- Additive review overlay. No historical source, demo flag, receipt or engine is rewritten.
-- No approval or professional-authority assignment is seeded.
INSERT INTO permissions(code) VALUES('verification:govern');
INSERT INTO roles(code,scope) VALUES('VERIFICATION_GOVERNOR','PLATFORM');
INSERT INTO role_permissions(role_code,permission_code) VALUES('VERIFICATION_GOVERNOR','verification:govern');

CREATE TABLE verification_rubric_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pathway_version_id uuid NOT NULL REFERENCES pathway_versions(id),
 child_version_id uuid NOT NULL REFERENCES child_competency_versions(id), version integer NOT NULL CHECK(version>0),
 method text NOT NULL CHECK(method IN ('PRACTICAL','WORKPLACE','SIMULATION','DOCUMENT')),
 facet text NOT NULL CHECK(facet IN ('PRACTICALLY_VERIFIED','WORKPLACE_VERIFIED','SIMULATION_VERIFIED','DOCUMENT_VERIFIED')),
 criteria jsonb NOT NULL CHECK(jsonb_typeof(criteria)='array' AND jsonb_array_length(criteria) BETWEEN 1 AND 100),
 status text NOT NULL CHECK(status IN ('PROPOSED','APPROVED')), demo boolean NOT NULL,
 policy_reference text NOT NULL CHECK(length(btrim(policy_reference)) BETWEEN 10 AND 500),
 approval_reference text, moderation_required boolean NOT NULL,
 allowed_processes text[] NOT NULL CHECK(cardinality(allowed_processes)>0 AND allowed_processes<@ARRAY['IN_PERSON','REMOTE_OBSERVATION','DOCUMENT_REVIEW','SIMULATION']::text[]),
 authored_by uuid NOT NULL REFERENCES users(id), actor_id uuid NOT NULL REFERENCES users(id),
 request_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(status<>'APPROVED' OR (NOT demo AND actor_id<>authored_by AND length(btrim(approval_reference))>=10)),
 CHECK(status<>'PROPOSED' OR demo),
 CHECK((method,facet) IN (('PRACTICAL','PRACTICALLY_VERIFIED'),('WORKPLACE','WORKPLACE_VERIFIED'),('SIMULATION','SIMULATION_VERIFIED'),('DOCUMENT','DOCUMENT_VERIFIED'))),
 UNIQUE(pathway_version_id,child_version_id,method,version)
);
CREATE TABLE verification_assessor_authorizations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), assessor_id uuid NOT NULL REFERENCES users(id),
 rubric_version_id uuid NOT NULL REFERENCES verification_rubric_versions(id),
 approval_reference text NOT NULL CHECK(length(btrim(approval_reference)) BETWEEN 10 AND 500),
 valid_until timestamptz NOT NULL, actor_id uuid NOT NULL REFERENCES users(id),
 request_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), CHECK(actor_id<>assessor_id)
);
CREATE TABLE verification_governance_revocations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), rubric_version_id uuid REFERENCES verification_rubric_versions(id),
 authorization_id uuid REFERENCES verification_assessor_authorizations(id),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 500),
 actor_id uuid NOT NULL REFERENCES users(id), request_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(num_nonnulls(rubric_version_id,authorization_id)=1)
);
CREATE FUNCTION verification18_authorized(assessor uuid,rubric uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT practical_capable(assessor,'assessment:review') AND EXISTS(
 SELECT 1 FROM verification_assessor_authorizations a WHERE a.assessor_id=assessor AND a.rubric_version_id=rubric
 AND a.valid_until>now() AND NOT EXISTS(SELECT 1 FROM verification_governance_revocations x WHERE x.authorization_id=a.id))
$$;
-- ECMAScript String.trim whitespace, matching the canonical Zod criterion schema.
CREATE FUNCTION verification18_trim(value text) RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
 SELECT btrim(value,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
$$;
CREATE FUNCTION verification18_valid_criteria(criteria_value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item jsonb; field text; content text;
BEGIN
 IF jsonb_typeof(criteria_value) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(criteria_value) NOT BETWEEN 1 AND 100 THEN RETURN false; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(criteria_value) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF item-ARRAY['id','version','criterion','evidenceRequirement']<>'{}'::jsonb
   OR jsonb_typeof(item->'id') IS DISTINCT FROM 'string'
   OR jsonb_typeof(item->'version') IS DISTINCT FROM 'number'
   OR jsonb_typeof(item->'criterion') IS DISTINCT FROM 'string'
   OR jsonb_typeof(item->'evidenceRequirement') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
  IF (item->>'id') !~ '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$' THEN RETURN false; END IF;
  IF (item->>'version')::numeric NOT BETWEEN 1 AND 9007199254740991
   OR (item->>'version')::numeric<>trunc((item->>'version')::numeric) THEN RETURN false; END IF;
  FOREACH field IN ARRAY ARRAY['criterion','evidenceRequirement'] LOOP
   content:=verification18_trim(item->>field);
   IF length(content) NOT BETWEEN 1 AND 1000 THEN RETURN false; END IF;
   -- Installed Zod measures string bounds in Unicode code points, as PostgreSQL does.
  END LOOP;
 END LOOP;
 RETURN (SELECT count(DISTINCT (x->>'id')::uuid)=jsonb_array_length(criteria_value) FROM jsonb_array_elements(criteria_value) x);
END $$;
CREATE FUNCTION verification18_governance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT practical_capable(NEW.actor_id,'verification:govern') THEN RAISE EXCEPTION 'Verification governance authority required'; END IF;
 IF TG_TABLE_NAME='verification_rubric_versions' THEN
  IF NOT EXISTS(SELECT 1 FROM child_group_mappings m JOIN pathway_competencies p ON p.competency_version_id=m.group_version_id WHERE m.child_version_id=NEW.child_version_id AND p.pathway_version_id=NEW.pathway_version_id) THEN RAISE EXCEPTION 'Verification rubric pathway mismatch'; END IF;
  IF NEW.status='APPROVED' AND (NEW.approval_reference IS NULL OR NOT EXISTS(SELECT 1 FROM child_competency_versions WHERE id=NEW.child_version_id AND validation_status='APPROVED')) THEN RAISE EXCEPTION 'Verification approved definition and reference required'; END IF;
  IF NOT verification18_valid_criteria(NEW.criteria) THEN RAISE EXCEPTION 'Verification canonical criteria required'; END IF;
  SELECT jsonb_agg(x||jsonb_build_object('version',(x->>'version')::bigint,'criterion',verification18_trim(x->>'criterion'),'evidenceRequirement',verification18_trim(x->>'evidenceRequirement')) ORDER BY n)
   INTO NEW.criteria FROM jsonb_array_elements(NEW.criteria) WITH ORDINALITY AS e(x,n);
 ELSIF TG_TABLE_NAME='verification_assessor_authorizations' THEN
  IF NEW.valid_until<=now() OR NOT practical_capable(NEW.assessor_id,'assessment:review') THEN RAISE EXCEPTION 'Verification active assessor authorization required'; END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE TABLE verification_cases(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), candidate_id uuid NOT NULL REFERENCES candidate_profiles(id),
 evidence_id uuid NOT NULL UNIQUE REFERENCES competency_evidence(id),
 rubric_version_id uuid NOT NULL REFERENCES verification_rubric_versions(id),
 previous_case_id uuid UNIQUE REFERENCES verification_cases(id),
 activity text NOT NULL CHECK(length(btrim(activity)) BETWEEN 1 AND 160), performed_at timestamptz NOT NULL,
 location_type text NOT NULL CHECK(length(btrim(location_type)) BETWEEN 1 AND 100),
 process text NOT NULL CHECK(process IN ('IN_PERSON','REMOTE_OBSERVATION','DOCUMENT_REVIEW','SIMULATION')),
 declaration boolean NOT NULL CHECK(declaration), actor_id uuid NOT NULL REFERENCES users(id),
 command_id uuid NOT NULL, input_digest text NOT NULL CHECK(input_digest ~ '^[0-9a-f]{64}$'),
 request_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(candidate_id,command_id)
);
CREATE INDEX verification_cases_owner ON verification_cases(candidate_id,created_at DESC,id);
CREATE TABLE verification_case_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL REFERENCES verification_cases(id),
 revision integer NOT NULL CHECK(revision>0),
 kind text NOT NULL CHECK(kind IN ('ASSIGN','START_REVIEW','RECUSE','DECISION','APPEAL','WITHDRAW')),
 assessor_id uuid REFERENCES users(id), outcome text CHECK(outcome IN ('VERIFIED','PARTIALLY_DEMONSTRATED','MORE_EVIDENCE_REQUIRED','NOT_DEMONSTRATED','INVALIDATED')),
 supersedes_decision_id uuid UNIQUE REFERENCES verification_case_events(id),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 actor_id uuid NOT NULL REFERENCES users(id), command_id uuid NOT NULL,
 input_digest text NOT NULL CHECK(input_digest ~ '^[0-9a-f]{64}$'), request_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(case_id,revision), UNIQUE(actor_id,command_id),
 CHECK((kind='ASSIGN')=(assessor_id IS NOT NULL)), CHECK((kind='DECISION')=(outcome IS NOT NULL)),
 CHECK(kind='DECISION' OR supersedes_decision_id IS NULL)
);
-- A new independent PRIMARY starts a new support chain. MODERATION depends on
-- its preceding review(s), so recusal of any supporting actor withholds the claim.
CREATE FUNCTION verification18_unconflicted(decision uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 WITH RECURSIVE support AS (
  SELECT id,case_id,actor_id,supersedes_decision_id,payload FROM verification_case_events WHERE id=decision AND kind='DECISION'
  UNION ALL
  SELECT p.id,p.case_id,p.actor_id,p.supersedes_decision_id,p.payload FROM support s JOIN verification_case_events p ON p.id=s.supersedes_decision_id
   WHERE s.payload->>'reviewKind'='MODERATION'
 ) SELECT EXISTS(SELECT 1 FROM support) AND NOT EXISTS(
  SELECT 1 FROM support s JOIN verification_case_events conflict ON conflict.case_id=s.case_id AND conflict.actor_id=s.actor_id AND conflict.kind='RECUSE')
$$;
-- Validate the exact authorization recorded by every contributing review.
-- A later grant cannot revive a decision made under a revoked authorization.
CREATE FUNCTION verification18_authority_valid(decision uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 WITH RECURSIVE support AS (
  SELECT id,case_id,actor_id,supersedes_decision_id,payload FROM verification_case_events WHERE id=decision AND kind='DECISION'
  UNION ALL
  SELECT p.id,p.case_id,p.actor_id,p.supersedes_decision_id,p.payload FROM support s JOIN verification_case_events p ON p.id=s.supersedes_decision_id
   WHERE s.payload->>'reviewKind'='MODERATION'
 ) SELECT EXISTS(SELECT 1 FROM support) AND NOT EXISTS(
  SELECT 1 FROM support s JOIN verification_cases c ON c.id=s.case_id
  WHERE NOT practical_capable(s.actor_id,'assessment:review') OR NOT EXISTS(
   SELECT 1 FROM verification_assessor_authorizations a WHERE a.id::text=s.payload->>'authorizationId'
   AND a.assessor_id=s.actor_id AND a.rubric_version_id=c.rubric_version_id AND a.valid_until>now()
   AND NOT EXISTS(SELECT 1 FROM verification_governance_revocations x WHERE x.authorization_id=a.id)))
$$;
CREATE FUNCTION verification18_case_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e competency_evidence%ROWTYPE; r verification_rubric_versions%ROWTYPE; prior verification_cases%ROWTYPE;
BEGIN
 SELECT * INTO e FROM competency_evidence WHERE id=NEW.evidence_id;
 SELECT * INTO r FROM verification_rubric_versions WHERE id=NEW.rubric_version_id;
 IF NOT practical_capable(NEW.actor_id,'candidate:own') OR NOT EXISTS(SELECT 1 FROM candidate_profiles WHERE id=NEW.candidate_id AND user_id=NEW.actor_id)
 OR e.candidate_id IS DISTINCT FROM NEW.candidate_id OR e.source_kind IS DISTINCT FROM 'EXTERNAL_SUBMISSION'
 OR e.child_version_id IS DISTINCT FROM r.child_version_id OR e.facet IS DISTINCT FROM r.facet OR e.demo IS DISTINCT FROM r.demo
 OR NOT EXISTS(SELECT 1 FROM evidence_submission_versions v WHERE v.id=e.submission_version_id AND v.pathway_version_id=r.pathway_version_id AND NOT v.practical AND v.status IN ('SUBMITTED','RESUBMITTED'))
 THEN RAISE EXCEPTION 'Verification owned canonical source and exact rubric required'; END IF;
 IF NEW.performed_at>now() OR EXISTS(SELECT 1 FROM verification_governance_revocations WHERE rubric_version_id=r.id) THEN RAISE EXCEPTION 'Verification activity or rubric unavailable'; END IF;
 IF NOT NEW.process=ANY(r.allowed_processes) THEN RAISE EXCEPTION 'Verification approved process required'; END IF;
 IF (r.method='SIMULATION') IS DISTINCT FROM (NEW.process='SIMULATION') OR (r.method='DOCUMENT') IS DISTINCT FROM (NEW.process='DOCUMENT_REVIEW') THEN RAISE EXCEPTION 'Verification process does not match method'; END IF;
 IF NEW.previous_case_id IS NOT NULL THEN
  SELECT * INTO prior FROM verification_cases WHERE id=NEW.previous_case_id FOR UPDATE;
  IF prior.candidate_id IS DISTINCT FROM NEW.candidate_id OR NOT EXISTS(SELECT 1 FROM verification_rubric_versions p WHERE p.id=prior.rubric_version_id AND p.pathway_version_id=r.pathway_version_id AND p.child_version_id=r.child_version_id AND p.method=r.method)
  OR NOT (EXISTS(SELECT 1 FROM verification_case_events WHERE case_id=prior.id AND kind='DECISION')
   OR (prior.previous_case_id IS NOT NULL AND EXISTS(SELECT 1 FROM verification_case_events WHERE case_id=prior.id AND kind='WITHDRAW')
    AND NOT EXISTS(SELECT 1 FROM verification_case_events WHERE case_id=prior.id AND kind='DECISION')))
  THEN RAISE EXCEPTION 'Verification reassessment predecessor mismatch'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION verification18_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c verification_cases%ROWTYPE; r verification_rubric_versions%ROWTYPE;
 assignment verification_case_events%ROWTYPE; prior verification_case_events%ROWTYPE;
 owner_id uuid; n integer; criterion jsonb; finding jsonb;
BEGIN
 SELECT * INTO c FROM verification_cases WHERE id=NEW.case_id FOR UPDATE;
 SELECT user_id INTO owner_id FROM candidate_profiles WHERE id=c.candidate_id;
 SELECT * INTO r FROM verification_rubric_versions WHERE id=c.rubric_version_id;
 SELECT coalesce(max(revision),0) INTO n FROM verification_case_events WHERE case_id=c.id;
 IF NEW.revision<>n+1 THEN RAISE EXCEPTION 'Verification stale revision'; END IF;
 IF NEW.kind NOT IN ('APPEAL','RECUSE') AND EXISTS(SELECT 1 FROM verification_cases WHERE previous_case_id=c.id) THEN RAISE EXCEPTION 'Verification reassessment superseded case'; END IF;
 IF NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.actor_id AND status='ACTIVE') OR EXISTS(SELECT 1 FROM verification_case_events WHERE case_id=c.id AND kind='WITHDRAW') THEN RAISE EXCEPTION 'Verification inactive actor or withdrawn case'; END IF;
 SELECT * INTO assignment FROM verification_case_events WHERE case_id=c.id AND kind='ASSIGN' ORDER BY revision DESC LIMIT 1;
 SELECT * INTO prior FROM verification_case_events WHERE case_id=c.id AND kind='DECISION' ORDER BY revision DESC LIMIT 1;
 IF NEW.kind='ASSIGN' THEN
  IF NOT practical_capable(NEW.actor_id,'assessment:assign') OR NEW.assessor_id=owner_id OR NOT practical_capable(NEW.assessor_id,'assessment:review')
  OR EXISTS(SELECT 1 FROM verification_case_events WHERE case_id=c.id AND kind='RECUSE' AND actor_id=NEW.assessor_id)
  OR (NOT r.demo AND NOT verification18_authorized(NEW.assessor_id,r.id)) OR coalesce(length(btrim(NEW.payload->>'reason')),0)<10 THEN RAISE EXCEPTION 'Verification independent scoped assignment required'; END IF;
 ELSIF NEW.kind IN ('APPEAL','WITHDRAW') THEN
  IF NEW.actor_id<>owner_id OR NOT practical_capable(NEW.actor_id,'candidate:own') OR coalesce(length(btrim(NEW.payload->>'reason')),0)<10
  OR (NEW.kind='APPEAL' AND prior.id IS NULL) OR (NEW.kind='WITHDRAW' AND prior.id IS NOT NULL) THEN RAISE EXCEPTION 'Verification owner transition unavailable'; END IF;
 ELSE
  IF owner_id=NEW.actor_id OR NOT practical_capable(NEW.actor_id,'assessment:review')
  OR NOT ((assignment.id IS NOT NULL AND assignment.assessor_id=NEW.actor_id)
   OR (NEW.kind='RECUSE' AND EXISTS(SELECT 1 FROM verification_case_events WHERE case_id=c.id AND kind='DECISION' AND actor_id=NEW.actor_id)))
  OR (NEW.kind<>'RECUSE' AND ((NOT r.demo AND NOT verification18_authorized(NEW.actor_id,r.id)) OR EXISTS(SELECT 1 FROM verification_governance_revocations WHERE rubric_version_id=r.id)))
  OR EXISTS(SELECT 1 FROM verification_case_events WHERE case_id=c.id AND kind='RECUSE' AND actor_id=NEW.actor_id) THEN RAISE EXCEPTION 'Verification assigned nonconflicted assessor required'; END IF;
  IF NEW.kind='RECUSE' THEN
   IF coalesce(length(btrim(NEW.payload->>'category')),0)=0 OR coalesce(length(btrim(NEW.payload->>'reason')),0)<10 THEN RAISE EXCEPTION 'Verification conflict record required'; END IF;
  ELSIF NEW.kind='START_REVIEW' THEN
   IF EXISTS(SELECT 1 FROM verification_case_events WHERE case_id=c.id AND kind='START_REVIEW' AND revision>assignment.revision) THEN RAISE EXCEPTION 'Verification review already started'; END IF;
  ELSIF NEW.kind='DECISION' THEN
   IF NOT verification18_valid_criteria(r.criteria) THEN RAISE EXCEPTION 'Verification canonical criteria required'; END IF;
   IF NOT EXISTS(SELECT 1 FROM verification_case_events WHERE case_id=c.id AND kind='START_REVIEW' AND revision>assignment.revision)
   OR NEW.supersedes_decision_id IS DISTINCT FROM prior.id OR NEW.payload->>'conflictDeclaredClear' IS DISTINCT FROM 'true'
   OR coalesce(length(btrim(NEW.payload->>'rationale')),0)<10 OR coalesce(length(btrim(NEW.payload->>'candidateExplanation')),0)<10
   OR jsonb_typeof(NEW.payload->'findings') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Verification structured current review required'; END IF;
   IF NEW.outcome<>'INVALIDATED' THEN
    IF jsonb_array_length(NEW.payload->'findings')<>jsonb_array_length(r.criteria) THEN RAISE EXCEPTION 'Verification complete criteria required'; END IF;
    FOR criterion IN SELECT * FROM jsonb_array_elements(r.criteria) LOOP
     SELECT x INTO finding FROM jsonb_array_elements(NEW.payload->'findings') x WHERE x->>'criterionId'=criterion->>'id' AND x->>'criterionVersion'=criterion->>'version';
     IF finding IS NULL OR coalesce(length(btrim(finding->>'observation')),0)<10 OR coalesce(length(btrim(finding->>'rationale')),0)<10
     OR finding->>'outcome' IS NULL OR finding->>'outcome' NOT IN ('DEMONSTRATED','PARTIAL','MISSING','NOT_DEMONSTRATED')
     OR jsonb_typeof(finding->'evidenceIds') IS DISTINCT FROM 'array' OR jsonb_array_length(finding->'evidenceIds')<>1 OR finding->'evidenceIds'->>0 IS DISTINCT FROM c.evidence_id::text THEN RAISE EXCEPTION 'Verification exact criterion and evidence required'; END IF;
    END LOOP;
   ELSIF prior.id IS NULL THEN RAISE EXCEPTION 'Verification invalidation needs predecessor'; END IF;
   IF NEW.outcome='VERIFIED' AND (r.demo OR r.status<>'APPROVED' OR NOT verification18_authorized(NEW.actor_id,r.id)
    OR NOT EXISTS(SELECT 1 FROM competency_evidence e JOIN evidence_submission_versions v ON v.id=e.submission_version_id WHERE e.id=c.evidence_id AND NOT e.demo AND v.status IN ('SUBMITTED','RESUBMITTED'))
    OR NOT EXISTS(SELECT 1 FROM verification_assessor_authorizations a WHERE a.id::text=NEW.payload->>'authorizationId' AND a.assessor_id=NEW.actor_id AND a.rubric_version_id=r.id AND a.valid_until>now() AND NOT EXISTS(SELECT 1 FROM verification_governance_revocations x WHERE x.authorization_id=a.id))
    OR EXISTS(SELECT 1 FROM verification_governance_revocations WHERE rubric_version_id=r.id)
    OR NOT EXISTS(SELECT 1 FROM child_competency_versions WHERE id=r.child_version_id AND validation_status='APPROVED')) THEN RAISE EXCEPTION 'Verification approved professional governance required'; END IF;
   IF NEW.payload->>'reviewKind'='MODERATION' AND (prior.id IS NULL OR prior.actor_id=NEW.actor_id OR NOT practical_capable(NEW.actor_id,'assessment:moderate')) THEN RAISE EXCEPTION 'Verification independent moderation required'; END IF;
   IF NEW.outcome='VERIFIED' AND NEW.payload->>'reviewKind'='MODERATION' AND NOT verification18_unconflicted(prior.id) THEN RAISE EXCEPTION 'Verification independent unconflicted review required'; END IF;
   IF NEW.outcome='VERIFIED' AND NEW.payload->>'reviewKind'='MODERATION' AND NOT verification18_authority_valid(prior.id) THEN RAISE EXCEPTION 'Verification valid supporting authority required'; END IF;
   IF NEW.payload->>'reviewKind' IS NULL OR NEW.payload->>'reviewKind' NOT IN ('PRIMARY','MODERATION') THEN RAISE EXCEPTION 'Verification review kind required'; END IF;
   NEW.payload:=NEW.payload||jsonb_build_object(
    'evidenceLevelBefore',CASE WHEN prior.outcome='VERIFIED' AND prior.payload->>'evidenceLevelAfter'=r.facet AND verification18_unconflicted(prior.id) AND verification18_authority_valid(prior.id)
     AND EXISTS(SELECT 1 FROM verification_assessor_authorizations a WHERE a.id::text=prior.payload->>'authorizationId' AND a.valid_until>now() AND NOT EXISTS(SELECT 1 FROM verification_governance_revocations x WHERE x.authorization_id=a.id)) THEN r.facet ELSE 'SELF_DECLARED' END,
    'evidenceLevelAfter',CASE WHEN NEW.outcome='VERIFIED' AND (NOT r.moderation_required OR NEW.payload->>'reviewKind'='MODERATION') THEN r.facet ELSE 'SELF_DECLARED' END);
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION verification18_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO audit_events(actor_id,action,resource_type,resource_id,request_id,metadata)
 VALUES(NEW.actor_id,'verification.'||TG_TABLE_NAME||'.recorded',TG_TABLE_NAME,NEW.id,NEW.request_id,
 jsonb_build_object('recordId',NEW.id,'caseId',to_jsonb(NEW)->>'case_id','kind',to_jsonb(NEW)->>'kind','revision',to_jsonb(NEW)->>'revision'));
 RETURN NEW;
END $$;
CREATE TRIGGER verification_case_valid BEFORE INSERT ON verification_cases FOR EACH ROW EXECUTE FUNCTION verification18_case_guard();
CREATE TRIGGER verification_event_valid BEFORE INSERT ON verification_case_events FOR EACH ROW EXECUTE FUNCTION verification18_event_guard();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['verification_rubric_versions','verification_assessor_authorizations','verification_governance_revocations','verification_cases','verification_case_events'] LOOP
  EXECUTE format('CREATE TRIGGER verification_frozen BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION append_only()',t);
  EXECUTE format('CREATE TRIGGER verification_audited AFTER INSERT ON %I FOR EACH ROW EXECUTE FUNCTION verification18_audit()',t);
  IF t IN ('verification_rubric_versions','verification_assessor_authorizations','verification_governance_revocations') THEN
   EXECUTE format('CREATE TRIGGER verification_governed BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION verification18_governance_guard()',t);
  END IF;
 END LOOP;
END $$;
