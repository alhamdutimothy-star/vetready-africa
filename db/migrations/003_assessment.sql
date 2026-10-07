-- Additive Phase 2 hierarchy: legacy competencies remain organizing groups.
CREATE TABLE competency_domains(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text UNIQUE NOT NULL,name text NOT NULL);
CREATE TABLE pathway_domain_groups(
 pathway_version_id uuid NOT NULL,group_version_id uuid NOT NULL,domain_id uuid NOT NULL REFERENCES competency_domains(id),
 PRIMARY KEY(pathway_version_id,group_version_id),
 FOREIGN KEY(pathway_version_id,group_version_id) REFERENCES pathway_competencies(pathway_version_id,competency_version_id)
);
CREATE TABLE child_competencies(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text UNIQUE NOT NULL);
CREATE TABLE child_competency_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),child_id uuid NOT NULL REFERENCES child_competencies(id),version integer NOT NULL CHECK(version>0),
 statement text NOT NULL,proposed_method text NOT NULL,context_kind text NOT NULL,standards_to_validate text NOT NULL,
 validation_status text NOT NULL DEFAULT 'PROPOSED' CHECK(validation_status IN ('PROPOSED','EXPERT_REVIEWED','APPROVED','RETIRED')),
 validation_notice text NOT NULL DEFAULT 'PROPOSED — REQUIRES DOMAIN EXPERT VALIDATION',
 author_id uuid REFERENCES users(id),reviewer_id uuid REFERENCES users(id),reviewed_at timestamptz,source_references jsonb NOT NULL DEFAULT '[]',
 UNIQUE(child_id,version),CHECK(validation_status NOT IN ('EXPERT_REVIEWED','APPROVED') OR (author_id IS NOT NULL AND reviewer_id IS NOT NULL AND author_id<>reviewer_id AND reviewed_at IS NOT NULL AND jsonb_array_length(source_references)>0))
);
CREATE TABLE child_group_mappings(child_version_id uuid REFERENCES child_competency_versions(id),group_version_id uuid REFERENCES competency_versions(id),PRIMARY KEY(child_version_id,group_version_id));
CREATE TABLE child_criteria(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),child_version_id uuid NOT NULL REFERENCES child_competency_versions(id),position integer NOT NULL CHECK(position>0),statement text NOT NULL,UNIQUE(child_version_id,position),UNIQUE(id,child_version_id));
-- Requirements are version-bound proposals; no mandatory gates are seeded.
CREATE TABLE pathway_child_requirements(
 pathway_version_id uuid NOT NULL REFERENCES pathway_versions(id),child_version_id uuid NOT NULL REFERENCES child_competency_versions(id),
 proposed_facets text[] NOT NULL,mandatory boolean,validation_status text NOT NULL DEFAULT 'PROPOSED' CHECK(validation_status IN ('PROPOSED','APPROVED')),
 PRIMARY KEY(pathway_version_id,child_version_id),CHECK(mandatory IS NULL OR validation_status='APPROVED'),
 CHECK(proposed_facets <@ ARRAY['SELF_DECLARED','DOCUMENT_VERIFIED','KNOWLEDGE_ASSESSED','CASE_ASSESSED','SIMULATION_VERIFIED','PRACTICALLY_VERIFIED','WORKPLACE_VERIFIED']::text[])
);
CREATE TABLE assessments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text UNIQUE NOT NULL);
CREATE TABLE assessment_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),assessment_id uuid NOT NULL REFERENCES assessments(id),version integer NOT NULL CHECK(version>0),
 pathway_version_id uuid NOT NULL REFERENCES pathway_versions(id),title text NOT NULL,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','DEMO','APPROVED','RETIRED')),demo boolean NOT NULL DEFAULT true,
 notice text NOT NULL DEFAULT 'DEMO CONTENT — NOT YET APPROVED FOR PRODUCTION ASSESSMENT',randomize boolean NOT NULL DEFAULT true,
 author_id uuid REFERENCES users(id),reviewer_id uuid REFERENCES users(id),reviewed_at timestamptz,source_references jsonb NOT NULL DEFAULT '[]',created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(assessment_id,version),CHECK(status<>'DEMO' OR demo),CHECK(status<>'APPROVED' OR (NOT demo AND author_id IS NOT NULL AND reviewer_id IS NOT NULL AND author_id<>reviewer_id AND reviewed_at IS NOT NULL AND jsonb_array_length(source_references)>0))
);
CREATE TABLE assessment_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text UNIQUE NOT NULL);
CREATE TABLE assessment_item_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),item_id uuid NOT NULL REFERENCES assessment_items(id),version integer NOT NULL CHECK(version>0),
 type text NOT NULL CHECK(type IN ('SINGLE_MCQ','MULTIPLE_RESPONSE','NUMERICAL','DATA_INTERPRETATION','CLINICAL_SCENARIO','FARM_SCENARIO','CASE','SHORT_TEXT','EXTENDED_TEXT','REPORT','TECHNICAL_SALES','FILE_IMAGE','PRACTICAL_PLACEHOLDER')),
 prompt text NOT NULL,presentation jsonb NOT NULL DEFAULT '{}',answer_key jsonb,method text NOT NULL CHECK(method IN ('KNOWLEDGE','CASE','SIMULATION','PRACTICAL','WORKPLACE')),
 difficulty text NOT NULL CHECK(difficulty IN ('INTRODUCTORY','INTERMEDIATE','ADVANCED')),
 evidence_type text NOT NULL CHECK(evidence_type IN ('KNOWLEDGE_ASSESSED','CASE_ASSESSED','SIMULATION_VERIFIED','PRACTICALLY_VERIFIED','WORKPLACE_VERIFIED')),
 validation_status text NOT NULL DEFAULT 'PROPOSED' CHECK(validation_status IN ('PROPOSED','EXPERT_REVIEWED','APPROVED','RETIRED')),demo boolean NOT NULL DEFAULT true,
 author_id uuid REFERENCES users(id),reviewer_id uuid REFERENCES users(id),reviewed_at timestamptz,source_references jsonb NOT NULL DEFAULT '[]',
 UNIQUE(item_id,version),CHECK((method='KNOWLEDGE' AND evidence_type='KNOWLEDGE_ASSESSED') OR (method='CASE' AND evidence_type='CASE_ASSESSED') OR (method='SIMULATION' AND evidence_type='SIMULATION_VERIFIED') OR (method='PRACTICAL' AND evidence_type='PRACTICALLY_VERIFIED') OR (method='WORKPLACE' AND evidence_type='WORKPLACE_VERIFIED')),
 CHECK(type NOT IN ('SINGLE_MCQ','MULTIPLE_RESPONSE','NUMERICAL') OR method='KNOWLEDGE'),
 CHECK(validation_status<>'APPROVED' OR (NOT demo AND author_id IS NOT NULL AND reviewer_id IS NOT NULL AND author_id<>reviewer_id AND reviewed_at IS NOT NULL AND jsonb_array_length(source_references)>0))
);
CREATE TABLE assessment_blueprint(
 assessment_version_id uuid NOT NULL REFERENCES assessment_versions(id),item_version_id uuid NOT NULL REFERENCES assessment_item_versions(id),
 pathway_version_id uuid NOT NULL,group_version_id uuid NOT NULL,child_version_id uuid NOT NULL,
 PRIMARY KEY(assessment_version_id,item_version_id),
 FOREIGN KEY(pathway_version_id,group_version_id) REFERENCES pathway_domain_groups(pathway_version_id,group_version_id),
 FOREIGN KEY(child_version_id,group_version_id) REFERENCES child_group_mappings(child_version_id,group_version_id)
);
CREATE TABLE rubric_criteria(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),item_version_id uuid NOT NULL REFERENCES assessment_item_versions(id),child_version_id uuid NOT NULL,
 criterion_id uuid NOT NULL,description text NOT NULL,
 FOREIGN KEY(criterion_id,child_version_id) REFERENCES child_criteria(id,child_version_id),UNIQUE(item_version_id,criterion_id)
);
CREATE TABLE assessment_attempts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),candidate_id uuid NOT NULL REFERENCES candidate_profiles(id),assessment_version_id uuid NOT NULL REFERENCES assessment_versions(id),
 status text NOT NULL DEFAULT 'IN_PROGRESS' CHECK(status IN ('IN_PROGRESS','SUBMITTED','REVIEWED')),started_at timestamptz NOT NULL DEFAULT now(),submitted_at timestamptz,reviewed_at timestamptz,
 assigned_assessor_id uuid REFERENCES users(id),UNIQUE(id,candidate_id),UNIQUE(id,assessment_version_id)
);
CREATE UNIQUE INDEX one_active_attempt ON assessment_attempts(candidate_id,assessment_version_id) WHERE status='IN_PROGRESS';
CREATE TABLE attempt_items(
 attempt_id uuid NOT NULL,assessment_version_id uuid NOT NULL,item_version_id uuid NOT NULL,position integer NOT NULL CHECK(position>0),
 PRIMARY KEY(attempt_id,item_version_id),UNIQUE(attempt_id,position),
 FOREIGN KEY(attempt_id,assessment_version_id) REFERENCES assessment_attempts(id,assessment_version_id),
 FOREIGN KEY(assessment_version_id,item_version_id) REFERENCES assessment_blueprint(assessment_version_id,item_version_id)
);
CREATE TABLE candidate_responses(
 attempt_id uuid NOT NULL,item_version_id uuid NOT NULL,response jsonb NOT NULL,objective_outcome text CHECK(objective_outcome IN ('CORRECT','INCORRECT','REQUIRES_REVIEW')),
 updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(attempt_id,item_version_id),FOREIGN KEY(attempt_id,item_version_id) REFERENCES attempt_items(attempt_id,item_version_id)
);
CREATE TABLE assessor_reviews(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),attempt_id uuid NOT NULL REFERENCES assessment_attempts(id),assessor_id uuid NOT NULL REFERENCES users(id),
 feedback text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,attempt_id)
);
CREATE TABLE rubric_observations(
 review_id uuid NOT NULL REFERENCES assessor_reviews(id),rubric_criterion_id uuid NOT NULL REFERENCES rubric_criteria(id),
 observation text NOT NULL CHECK(observation IN ('DEMONSTRATED','NEEDS_DEVELOPMENT','UNASSESSABLE')),comment text NOT NULL,PRIMARY KEY(review_id,rubric_criterion_id)
);
CREATE TABLE competency_evidence(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),candidate_id uuid NOT NULL REFERENCES candidate_profiles(id),child_version_id uuid NOT NULL REFERENCES child_competency_versions(id),
 attempt_id uuid NOT NULL,item_version_id uuid NOT NULL,facet text NOT NULL CHECK(facet IN ('KNOWLEDGE_ASSESSED','CASE_ASSESSED','SIMULATION_VERIFIED','PRACTICALLY_VERIFIED','WORKPLACE_VERIFIED')),
 demo boolean NOT NULL,status text NOT NULL DEFAULT 'UNVERIFIED' CHECK(status IN ('UNVERIFIED','VERIFIED','REJECTED','REVOKED')),
 observation text NOT NULL CHECK(observation IN ('CORRECT','INCORRECT','REQUIRES_REVIEW','DEMONSTRATED','NEEDS_DEVELOPMENT','UNASSESSABLE')),
 context jsonb NOT NULL DEFAULT '{}',observed_at timestamptz NOT NULL DEFAULT now(),valid_until timestamptz,
 FOREIGN KEY(attempt_id,candidate_id) REFERENCES assessment_attempts(id,candidate_id),FOREIGN KEY(attempt_id,item_version_id) REFERENCES attempt_items(attempt_id,item_version_id),UNIQUE(attempt_id,item_version_id)
);
CREATE TABLE competency_evidence_reviews(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),evidence_id uuid NOT NULL REFERENCES competency_evidence(id),reviewer_id uuid NOT NULL REFERENCES users(id),
 outcome text NOT NULL CHECK(outcome IN ('VERIFIED','REJECTED','REVOKED')),reason text NOT NULL CHECK(length(reason)>=10),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE assessment_moderations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),review_id uuid NOT NULL REFERENCES assessor_reviews(id),moderator_id uuid NOT NULL REFERENCES users(id),outcome text NOT NULL CHECK(outcome IN ('CONFIRMED','RETURNED')),reason text NOT NULL CHECK(length(reason)>=10),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE assessment_appeals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),attempt_id uuid NOT NULL REFERENCES assessment_attempts(id),candidate_id uuid NOT NULL REFERENCES candidate_profiles(id),reason text NOT NULL CHECK(length(reason)>=10),created_at timestamptz NOT NULL DEFAULT now(),resolved_by uuid REFERENCES users(id),resolution text,resolved_at timestamptz,FOREIGN KEY(attempt_id,candidate_id) REFERENCES assessment_attempts(id,candidate_id));
CREATE TABLE development_plans(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),candidate_id uuid NOT NULL REFERENCES candidate_profiles(id),pathway_version_id uuid NOT NULL REFERENCES pathway_versions(id),engine_version text NOT NULL,snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE development_plan_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),plan_id uuid NOT NULL REFERENCES development_plans(id),child_version_id uuid NOT NULL REFERENCES child_competency_versions(id),gap text NOT NULL,activity text NOT NULL,validation_status text NOT NULL,completed_at timestamptz);
CREATE INDEX attempts_candidate ON assessment_attempts(candidate_id,started_at DESC);
CREATE INDEX evidence_candidate_child ON competency_evidence(candidate_id,child_version_id);
CREATE INDEX plans_candidate ON development_plans(candidate_id,created_at DESC);
-- Version content and blueprint freeze upon delivery. Retirement is the only permitted edit.
CREATE FUNCTION phase2_version_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='assessment_versions' THEN
  IF OLD.status<>'DRAFT' AND (TG_OP='DELETE' OR NOT(NEW.status='RETIRED' AND (to_jsonb(NEW)-'status')=(to_jsonb(OLD)-'status'))) THEN RAISE EXCEPTION 'Delivered version is immutable'; END IF;
 ELSIF TG_TABLE_NAME='assessment_item_versions' THEN
  IF EXISTS(SELECT 1 FROM assessment_blueprint b JOIN assessment_versions a ON a.id=b.assessment_version_id WHERE b.item_version_id=OLD.id AND a.status<>'DRAFT') THEN RAISE EXCEPTION 'Delivered item is immutable'; END IF;
 ELSIF TG_TABLE_NAME='child_competency_versions' THEN
  IF OLD.validation_status IN ('APPROVED','RETIRED') THEN RAISE EXCEPTION 'Approved child version is immutable'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER freeze_assessment BEFORE UPDATE OR DELETE ON assessment_versions FOR EACH ROW EXECUTE FUNCTION phase2_version_frozen();
CREATE TRIGGER freeze_item BEFORE UPDATE OR DELETE ON assessment_item_versions FOR EACH ROW EXECUTE FUNCTION phase2_version_frozen();
CREATE TRIGGER freeze_child BEFORE UPDATE OR DELETE ON child_competency_versions FOR EACH ROW EXECUTE FUNCTION phase2_version_frozen();
CREATE FUNCTION phase2_blueprint_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v assessment_versions; i assessment_item_versions;
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') AND EXISTS(SELECT 1 FROM assessment_versions WHERE id=OLD.assessment_version_id AND status<>'DRAFT') THEN RAISE EXCEPTION 'Blueprint immutable'; END IF;
 IF TG_OP<>'DELETE' THEN
  SELECT * INTO v FROM assessment_versions WHERE id=NEW.assessment_version_id;
  SELECT * INTO i FROM assessment_item_versions WHERE id=NEW.item_version_id;
  IF v.status<>'DRAFT' OR v.pathway_version_id<>NEW.pathway_version_id OR (NOT v.demo AND i.demo) THEN RAISE EXCEPTION 'Invalid blueprint'; END IF;
  RETURN NEW;
 END IF; RETURN OLD;
END $$;
CREATE TRIGGER blueprint_integrity BEFORE INSERT OR UPDATE OR DELETE ON assessment_blueprint FOR EACH ROW EXECUTE FUNCTION phase2_blueprint_guard();
CREATE FUNCTION phase2_response_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM assessment_attempts WHERE id=COALESCE(NEW.attempt_id,OLD.attempt_id) AND status<>'IN_PROGRESS') THEN RAISE EXCEPTION 'Submitted response immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER response_integrity BEFORE INSERT OR UPDATE OR DELETE ON candidate_responses FOR EACH ROW EXECUTE FUNCTION phase2_response_guard();
CREATE TRIGGER review_immutable BEFORE UPDATE OR DELETE ON assessor_reviews FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER evidence_reviews_immutable BEFORE UPDATE OR DELETE ON competency_evidence_reviews FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER moderation_immutable BEFORE UPDATE OR DELETE ON assessment_moderations FOR EACH ROW EXECUTE FUNCTION append_only();
