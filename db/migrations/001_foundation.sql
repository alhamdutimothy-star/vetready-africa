CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), issuer text NOT NULL, subject text NOT NULL,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUSPENDED','DELETED')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(issuer,subject)
);
CREATE TABLE permissions(code text PRIMARY KEY);
CREATE TABLE roles(code text PRIMARY KEY, scope text NOT NULL CHECK(scope IN ('PLATFORM','ORGANIZATION')), UNIQUE(code,scope));
CREATE TABLE role_permissions(role_code text NOT NULL REFERENCES roles(code), permission_code text NOT NULL REFERENCES permissions(code), PRIMARY KEY(role_code,permission_code));
CREATE TABLE organizations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), display_name text NOT NULL CHECK(length(display_name) BETWEEN 2 AND 160),
 sector text NOT NULL, country_code char(2) NOT NULL CHECK(country_code ~ '^[A-Z]{2}$'),
 verification_status text NOT NULL DEFAULT 'PENDING' CHECK(verification_status IN ('PENDING','VERIFIED','REJECTED','SUSPENDED')),
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE organization_memberships(organization_id uuid NOT NULL REFERENCES organizations(id),user_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(organization_id,user_id));
CREATE TABLE user_role_assignments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),role_code text NOT NULL,
 role_scope text NOT NULL,organization_id uuid REFERENCES organizations(id),granted_by uuid REFERENCES users(id),
 reason text NOT NULL CHECK(length(reason)>=10),expires_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(role_code,role_scope) REFERENCES roles(code,scope),
 FOREIGN KEY(organization_id,user_id) REFERENCES organization_memberships(organization_id,user_id),
 CHECK((role_scope='PLATFORM' AND organization_id IS NULL) OR (role_scope='ORGANIZATION' AND organization_id IS NOT NULL))
);
CREATE UNIQUE INDEX unique_platform_role ON user_role_assignments(user_id,role_code) WHERE organization_id IS NULL;
CREATE UNIQUE INDEX unique_organization_role ON user_role_assignments(user_id,role_code,organization_id) WHERE organization_id IS NOT NULL;
CREATE TABLE candidate_profiles(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL UNIQUE REFERENCES users(id),
 full_name text NOT NULL CHECK(length(full_name) BETWEEN 2 AND 160),country_code char(2) NOT NULL CHECK(country_code ~ '^[A-Z]{2}$'),
 state text NOT NULL,willing_to_relocate boolean NOT NULL,driving_ability boolean NOT NULL,
 professional_summary text NOT NULL DEFAULT '',discoverable boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pathways(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text NOT NULL UNIQUE,name text NOT NULL,description text NOT NULL);
CREATE TABLE pathway_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),pathway_id uuid NOT NULL REFERENCES pathways(id),version integer NOT NULL CHECK(version>0),
 approval_status text NOT NULL DEFAULT 'DRAFT' CHECK(approval_status IN ('DRAFT','EXPERT_REVIEWED','APPROVED','RETIRED')),
 validation_notice text NOT NULL DEFAULT 'REQUIRES DOMAIN EXPERT VALIDATION',author_id uuid REFERENCES users(id),reviewer_id uuid REFERENCES users(id),reviewed_at timestamptz,
 UNIQUE(pathway_id,version),CHECK(approval_status NOT IN ('EXPERT_REVIEWED','APPROVED') OR (reviewer_id IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE TABLE competencies(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text NOT NULL UNIQUE,category text NOT NULL);
CREATE TABLE competency_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),competency_id uuid NOT NULL REFERENCES competencies(id),version integer NOT NULL CHECK(version>0),
 name text NOT NULL,description text NOT NULL,approval_status text NOT NULL DEFAULT 'DRAFT' CHECK(approval_status IN ('DRAFT','EXPERT_REVIEWED','APPROVED','RETIRED')),
 validation_notice text NOT NULL DEFAULT 'REQUIRES DOMAIN EXPERT VALIDATION',author_id uuid REFERENCES users(id),reviewer_id uuid REFERENCES users(id),reviewed_at timestamptz,
 passing_threshold numeric CHECK(passing_threshold BETWEEN 0 AND 100),expires_after_days integer CHECK(expires_after_days>0),
 UNIQUE(competency_id,version),CHECK(approval_status NOT IN ('EXPERT_REVIEWED','APPROVED') OR (reviewer_id IS NOT NULL AND reviewed_at IS NOT NULL)),
 CHECK(passing_threshold IS NULL OR approval_status IN ('APPROVED','RETIRED'))
);
CREATE TABLE content_references(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),competency_version_id uuid NOT NULL REFERENCES competency_versions(id),title text NOT NULL,url text,accessed_at date);
CREATE TABLE pathway_competencies(
 pathway_version_id uuid NOT NULL REFERENCES pathway_versions(id),competency_version_id uuid NOT NULL REFERENCES competency_versions(id),
 layer text NOT NULL CHECK(layer IN ('CORE','PATHWAY')),required_level integer CHECK(required_level BETWEEN 1 AND 6),
 weight numeric CHECK(weight BETWEEN 0 AND 1),mandatory boolean,
 PRIMARY KEY(pathway_version_id,competency_version_id)
);
CREATE TABLE role_profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),pathway_version_id uuid NOT NULL REFERENCES pathway_versions(id),code text NOT NULL,name text NOT NULL,UNIQUE(pathway_version_id,code));
CREATE TABLE role_competencies(role_profile_id uuid NOT NULL REFERENCES role_profiles(id),competency_version_id uuid NOT NULL REFERENCES competency_versions(id),required_level integer CHECK(required_level BETWEEN 1 AND 6),weight numeric CHECK(weight BETWEEN 0 AND 1),mandatory boolean,PRIMARY KEY(role_profile_id,competency_version_id));
CREATE TABLE candidate_pathways(candidate_id uuid NOT NULL REFERENCES candidate_profiles(id),pathway_id uuid NOT NULL REFERENCES pathways(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(candidate_id,pathway_id));
CREATE TABLE evidence_records(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),candidate_id uuid NOT NULL REFERENCES candidate_profiles(id),competency_version_id uuid NOT NULL REFERENCES competency_versions(id),
 source text NOT NULL CHECK(source IN ('SELF_DECLARED','DOCUMENT','KNOWLEDGE','CASE','PRACTICAL','EMPLOYMENT','INTERNSHIP','MENTOR','EMPLOYER_FEEDBACK')),
 summary text NOT NULL CHECK(length(summary) BETWEEN 10 AND 2000),observed_at timestamptz,
 review_status text NOT NULL DEFAULT 'SUBMITTED' CHECK(review_status IN ('SUBMITTED','VERIFIED','REJECTED','REVOKED')),
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,candidate_id)
);
CREATE TABLE evidence_review_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),evidence_id uuid NOT NULL REFERENCES evidence_records(id),reviewer_id uuid NOT NULL REFERENCES users(id),
 outcome text NOT NULL CHECK(outcome IN ('VERIFIED','REJECTED','REVOKED','CORRECTED')),reason text NOT NULL CHECK(length(reason)>=10),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE candidate_competencies(
 candidate_id uuid NOT NULL REFERENCES candidate_profiles(id),competency_id uuid NOT NULL REFERENCES competencies(id),
 competency_level integer CHECK(competency_level BETWEEN 1 AND 6),valid_until timestamptz,
 PRIMARY KEY(candidate_id,competency_id)
);
CREATE TABLE competency_evidence_links(
 candidate_id uuid NOT NULL,competency_id uuid NOT NULL,evidence_id uuid NOT NULL,
 FOREIGN KEY(candidate_id,competency_id) REFERENCES candidate_competencies(candidate_id,competency_id),
 FOREIGN KEY(evidence_id,candidate_id) REFERENCES evidence_records(id,candidate_id),
 PRIMARY KEY(candidate_id,competency_id,evidence_id)
);
CREATE TABLE readiness_classifications(code text PRIMARY KEY,label text NOT NULL UNIQUE);
CREATE TABLE audit_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid REFERENCES users(id),action text NOT NULL,resource_type text NOT NULL,resource_id uuid,
 request_id uuid,metadata jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evidence_candidate_idx ON evidence_records(candidate_id,created_at DESC);
CREATE INDEX candidate_location_idx ON candidate_profiles(country_code,state);
CREATE INDEX competency_version_status_idx ON competency_versions(approval_status,competency_id);
CREATE INDEX audit_resource_idx ON audit_events(resource_type,resource_id,created_at DESC);
CREATE INDEX assignment_user_idx ON user_role_assignments(user_id,expires_at);
CREATE FUNCTION protect_approved_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.approval_status IN ('APPROVED','RETIRED') THEN
  IF TG_OP='UPDATE' AND OLD.approval_status='APPROVED' AND NEW.approval_status='RETIRED' AND (to_jsonb(OLD)-'approval_status')=(to_jsonb(NEW)-'approval_status') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Approved versions are immutable; create a new version';
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER protect_competency_version BEFORE UPDATE OR DELETE ON competency_versions FOR EACH ROW EXECUTE FUNCTION protect_approved_version();
CREATE TRIGGER protect_pathway_version BEFORE UPDATE OR DELETE ON pathway_versions FOR EACH ROW EXECUTE FUNCTION protect_approved_version();
CREATE FUNCTION append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Append-only record'; END $$;
CREATE TRIGGER protect_audit BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER protect_review_events BEFORE UPDATE OR DELETE ON evidence_review_events FOR EACH ROW EXECUTE FUNCTION append_only();
