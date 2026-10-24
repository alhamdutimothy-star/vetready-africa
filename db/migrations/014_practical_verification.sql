-- Phase 3F extends Phase 3A sources. Professional award policies remain unconfigured.
ALTER TABLE evidence_submission_versions
 ADD COLUMN practical boolean NOT NULL DEFAULT false,
 ADD COLUMN draft_revision integer NOT NULL DEFAULT 0 CHECK(draft_revision>=0),
 DROP CONSTRAINT evidence_submission_versions_status_check,
 DROP CONSTRAINT evidence_submission_versions_summary_check,
 DROP CONSTRAINT evidence_submission_versions_context_check;
ALTER TABLE evidence_submission_versions
 ADD CHECK(status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','NEEDS_REVISION','RESUBMITTED','VERIFIED','REJECTED','WITHDRAWN','REVIEWED','SUPERSEDED','REVOKED')),
 ADD CHECK((NOT practical AND length(btrim(summary)) BETWEEN 10 AND 4000) OR (practical AND length(summary)<=4000 AND (status IN ('DRAFT','WITHDRAWN') OR length(btrim(summary))>=10))),
 ADD CHECK(jsonb_typeof(context)='object' AND context ? 'task' AND jsonb_typeof(context->'task')='string' AND ((NOT practical AND length(btrim(context->>'task')) BETWEEN 1 AND 160) OR (practical AND length(context->>'task')<=160 AND (status IN ('DRAFT','WITHDRAWN') OR length(btrim(context->>'task'))>=1)))),
 ADD CHECK(NOT practical OR demo);

CREATE TABLE practical_draft_commands(
 version_id uuid NOT NULL REFERENCES evidence_submission_versions(id),
 command_id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0),
 payload_hash text NOT NULL CHECK(length(payload_hash)=64), actor_id uuid NOT NULL REFERENCES users(id),
 request_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(version_id,command_id), UNIQUE(version_id,revision)
);
CREATE TABLE practical_declarations(
 version_id uuid PRIMARY KEY REFERENCES evidence_submission_versions(id),
 actor_id uuid NOT NULL REFERENCES users(id), revision integer NOT NULL,
 declaration text NOT NULL CHECK(declaration='I confirm this account describes my own activity accurately, identifies my involvement and limitations, and contains no confidential third-party information. I understand submission is not verification or certification.'),
 request_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE practical_review_assignments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE, version_id uuid NOT NULL REFERENCES evidence_submission_versions(id),
 assessor_id uuid NOT NULL REFERENCES users(id), actor_id uuid NOT NULL REFERENCES users(id),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 500),
 request_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX practical_assignment_version ON practical_review_assignments(version_id,created_at,id);
CREATE TABLE practical_review_decisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE, assignment_id uuid NOT NULL REFERENCES practical_review_assignments(id),
 version_id uuid NOT NULL REFERENCES evidence_submission_versions(id), actor_id uuid NOT NULL REFERENCES users(id),
 outcome text NOT NULL CHECK(outcome IN ('DEMONSTRATED_IN_DEMO','NEEDS_REVISION','REJECTED')),
 rationale text NOT NULL CHECK(length(btrim(rationale)) BETWEEN 10 AND 2000),
 conflict_declared_clear boolean NOT NULL CHECK(conflict_declared_clear),
 supersedes_decision_id uuid UNIQUE REFERENCES practical_review_decisions(id),
 request_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX practical_initial_decision ON practical_review_decisions(version_id) WHERE supersedes_decision_id IS NULL;
CREATE INDEX practical_decision_version ON practical_review_decisions(version_id,created_at,id);

-- Existing capability evaluation: no new roles, permission grants or professional authority.
CREATE FUNCTION practical_capable(actor uuid, capability text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM users u JOIN user_role_assignments a ON a.user_id=u.id JOIN role_permissions p ON p.role_code=a.role_code
 WHERE u.id=actor AND u.status='ACTIVE' AND a.role_scope='PLATFORM' AND a.organization_id IS NULL AND (a.expires_at IS NULL OR a.expires_at>now()) AND p.permission_code=capability)
$$;
CREATE FUNCTION practical_record_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v evidence_submission_versions%ROWTYPE; owner_id uuid; a practical_review_assignments%ROWTYPE; prior practical_review_decisions%ROWTYPE;
BEGIN
 SELECT * INTO v FROM evidence_submission_versions WHERE id=NEW.version_id FOR UPDATE;
 SELECT created_by INTO owner_id FROM evidence_submissions WHERE id=v.submission_id;
 IF NOT v.practical OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.actor_id AND status='ACTIVE') THEN RAISE EXCEPTION 'Practical active actor required'; END IF;
 IF TG_TABLE_NAME IN ('practical_draft_commands','practical_declarations') THEN
  IF NEW.actor_id<>owner_id OR v.status<>'DRAFT' OR NEW.revision<>v.draft_revision THEN RAISE EXCEPTION 'Practical draft owner and revision required'; END IF;
  IF TG_TABLE_NAME='practical_declarations' AND (length(btrim(v.summary))<10 OR length(btrim(v.context->>'task'))<1 OR NOT EXISTS(SELECT 1 FROM evidence_submission_competencies WHERE submission_version_id=v.id)) THEN RAISE EXCEPTION 'Complete practical evidence required'; END IF;
 ELSIF TG_TABLE_NAME='practical_review_assignments' THEN
  IF NOT practical_capable(NEW.actor_id,'assessment:assign') OR NOT practical_capable(NEW.assessor_id,'assessment:review') OR NEW.assessor_id=owner_id OR v.status NOT IN ('SUBMITTED','RESUBMITTED','UNDER_REVIEW') THEN RAISE EXCEPTION 'Practical independent assignment required'; END IF;
 ELSE
  SELECT * INTO a FROM practical_review_assignments WHERE version_id=v.id ORDER BY sequence DESC LIMIT 1;
  SELECT * INTO prior FROM practical_review_decisions WHERE version_id=v.id ORDER BY sequence DESC LIMIT 1;
  IF a.id IS DISTINCT FROM NEW.assignment_id OR a.assessor_id<>NEW.actor_id OR owner_id=NEW.actor_id OR NOT practical_capable(NEW.actor_id,'assessment:review') OR v.status NOT IN ('UNDER_REVIEW','REVIEWED','NEEDS_REVISION','REJECTED') OR NEW.supersedes_decision_id IS DISTINCT FROM prior.id THEN RAISE EXCEPTION 'Practical assigned review or supersession required'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION practical_record_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO audit_events(actor_id,action,resource_type,resource_id,request_id,metadata)
 VALUES(NEW.actor_id,'practical.'||TG_TABLE_NAME||'.recorded','evidence_submission_version',NEW.version_id,NEW.request_id,
 jsonb_build_object('recordId',CASE WHEN TG_TABLE_NAME IN ('practical_review_assignments','practical_review_decisions') THEN to_jsonb(NEW)->>'id' ELSE NULL END));
 RETURN NEW;
END $$;
CREATE TRIGGER practical_command_guard BEFORE INSERT ON practical_draft_commands FOR EACH ROW EXECUTE FUNCTION practical_record_guard();
CREATE TRIGGER practical_declaration_guard BEFORE INSERT ON practical_declarations FOR EACH ROW EXECUTE FUNCTION practical_record_guard();
CREATE TRIGGER practical_assignment_guard BEFORE INSERT ON practical_review_assignments FOR EACH ROW EXECUTE FUNCTION practical_record_guard();
CREATE TRIGGER practical_decision_guard BEFORE INSERT ON practical_review_decisions FOR EACH ROW EXECUTE FUNCTION practical_record_guard();
CREATE TRIGGER practical_command_frozen BEFORE UPDATE OR DELETE ON practical_draft_commands FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER practical_declaration_frozen BEFORE UPDATE OR DELETE ON practical_declarations FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER practical_assignment_frozen BEFORE UPDATE OR DELETE ON practical_review_assignments FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER practical_decision_frozen BEFORE UPDATE OR DELETE ON practical_review_decisions FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER practical_command_audit AFTER INSERT ON practical_draft_commands FOR EACH ROW EXECUTE FUNCTION practical_record_audit();
CREATE TRIGGER practical_declaration_audit AFTER INSERT ON practical_declarations FOR EACH ROW EXECUTE FUNCTION practical_record_audit();
CREATE TRIGGER practical_assignment_audit AFTER INSERT ON practical_review_assignments FOR EACH ROW EXECUTE FUNCTION practical_record_audit();
CREATE TRIGGER practical_decision_audit AFTER INSERT ON practical_review_decisions FOR EACH ROW EXECUTE FUNCTION practical_record_audit();

CREATE FUNCTION practical_target_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v evidence_submission_versions%ROWTYPE;
BEGIN
 SELECT * INTO v FROM evidence_submission_versions WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.submission_version_id ELSE NEW.submission_version_id END FOR UPDATE;
 IF v.practical THEN
  IF EXISTS(SELECT 1 FROM practical_declarations WHERE version_id=v.id) THEN RAISE EXCEPTION 'Declared practical targets immutable'; END IF;
  IF TG_OP<>'DELETE' AND NEW.requested_facet NOT IN ('PRACTICALLY_VERIFIED','WORKPLACE_VERIFIED','SIMULATION_VERIFIED') THEN RAISE EXCEPTION 'Practical facet required'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER practical_target_valid BEFORE INSERT OR UPDATE OR DELETE ON evidence_submission_competencies FOR EACH ROW EXECUTE FUNCTION practical_target_guard();

CREATE OR REPLACE FUNCTION phase3_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id uuid; latest evidence_submission_versions%ROWTYPE;
BEGIN
 IF NEW.practical THEN
  SELECT s.created_by INTO owner_id FROM evidence_submissions s WHERE s.id=NEW.submission_id AND s.candidate_id=NEW.candidate_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.change_actor_id AND status='ACTIVE') THEN RAISE EXCEPTION 'Practical active actor required'; END IF;
  IF TG_OP='INSERT' THEN
   IF owner_id IS DISTINCT FROM NEW.change_actor_id OR NEW.status<>'DRAFT' OR NOT NEW.demo OR NEW.draft_revision<>0 THEN RAISE EXCEPTION 'Practical draft owner required'; END IF;
   SELECT * INTO latest FROM evidence_submission_versions WHERE submission_id=NEW.submission_id ORDER BY version DESC LIMIT 1;
   IF latest.id IS NULL THEN
    IF NEW.version<>1 OR NEW.previous_version_id IS NOT NULL THEN RAISE EXCEPTION 'Practical initial version required'; END IF;
   ELSIF NOT latest.practical OR latest.status NOT IN ('WITHDRAWN','SUPERSEDED','REVOKED') OR NEW.version<>latest.version+1 OR NEW.previous_version_id IS DISTINCT FROM latest.id THEN RAISE EXCEPTION 'Practical predecessor must be withdrawn, superseded or revoked'; END IF;
  ELSE
   IF NOT OLD.practical OR (to_jsonb(NEW)-ARRAY['summary','context','status','draft_revision','change_actor_id','change_reason','change_request_id'])<>(to_jsonb(OLD)-ARRAY['summary','context','status','draft_revision','change_actor_id','change_reason','change_request_id']) THEN RAISE EXCEPTION 'Practical identity immutable'; END IF;
   IF NEW.status=OLD.status THEN
    IF OLD.status<>'DRAFT' OR NEW.change_actor_id<>owner_id OR NEW.draft_revision<>OLD.draft_revision+1 OR EXISTS(SELECT 1 FROM practical_declarations WHERE version_id=NEW.id) THEN RAISE EXCEPTION 'Practical draft revision conflict'; END IF;
   ELSE
    IF (to_jsonb(NEW)-ARRAY['status','change_actor_id','change_reason','change_request_id'])<>(to_jsonb(OLD)-ARRAY['status','change_actor_id','change_reason','change_request_id']) THEN RAISE EXCEPTION 'Practical submitted content immutable'; END IF;
    IF NEW.status IN ('SUBMITTED','RESUBMITTED') THEN
     IF OLD.status<>'DRAFT' OR NEW.change_actor_id<>owner_id OR NEW.status<>(CASE WHEN NEW.version=1 THEN 'SUBMITTED' ELSE 'RESUBMITTED' END) OR NOT EXISTS(SELECT 1 FROM practical_declarations WHERE version_id=NEW.id AND actor_id=owner_id AND revision=NEW.draft_revision) OR NOT EXISTS(SELECT 1 FROM evidence_submission_competencies WHERE submission_version_id=NEW.id) THEN RAISE EXCEPTION 'Practical declaration and targets required'; END IF;
    ELSIF NEW.status='WITHDRAWN' THEN
     IF NEW.change_actor_id<>owner_id OR OLD.status NOT IN ('DRAFT','SUBMITTED','RESUBMITTED') THEN RAISE EXCEPTION 'Practical withdrawal unavailable'; END IF;
    ELSIF NEW.status='UNDER_REVIEW' THEN
     IF OLD.status NOT IN ('SUBMITTED','RESUBMITTED','UNDER_REVIEW') OR NOT EXISTS(SELECT 1 FROM practical_review_assignments WHERE version_id=NEW.id AND actor_id=NEW.change_actor_id AND request_id=NEW.change_request_id) THEN RAISE EXCEPTION 'Practical assignment required'; END IF;
    ELSIF NEW.status IN ('REVIEWED','NEEDS_REVISION','REJECTED') THEN
     IF OLD.status NOT IN ('UNDER_REVIEW','REVIEWED','NEEDS_REVISION','REJECTED') OR NOT EXISTS(SELECT 1 FROM practical_review_decisions WHERE version_id=NEW.id AND actor_id=NEW.change_actor_id AND request_id=NEW.change_request_id AND CASE outcome WHEN 'DEMONSTRATED_IN_DEMO' THEN 'REVIEWED' ELSE outcome END=NEW.status) THEN RAISE EXCEPTION 'Practical decision required'; END IF;
    ELSIF NEW.status='SUPERSEDED' THEN
     IF NEW.change_actor_id<>owner_id OR OLD.status NOT IN ('SUBMITTED','RESUBMITTED','UNDER_REVIEW','REVIEWED','NEEDS_REVISION','REJECTED') THEN RAISE EXCEPTION 'Practical supersession unavailable'; END IF;
    ELSIF NEW.status='REVOKED' THEN
     IF NOT practical_capable(NEW.change_actor_id,'assessment:assign') OR OLD.status IN ('DRAFT','WITHDRAWN','SUPERSEDED','REVOKED') THEN RAISE EXCEPTION 'Practical revocation authority required'; END IF;
    ELSE RAISE EXCEPTION 'Practical professional verification not configured'; END IF;
   END IF;
  END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' AND OLD.practical THEN RAISE EXCEPTION 'Practical identity immutable'; END IF;
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
