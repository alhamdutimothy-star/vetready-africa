-- Additive case metadata over Phase 2 assessments. No content, awards or rules are activated.
CREATE TABLE case_blueprints(
 assessment_version_id uuid PRIMARY KEY REFERENCES assessment_versions(id),
 professional_status text NOT NULL DEFAULT 'DRAFT' CHECK(professional_status IN ('DRAFT','EXPERT_REVIEWED','APPROVED','RETIRED')),
 effective_at timestamptz,
 scenario text NOT NULL CHECK(length(btrim(scenario)) BETWEEN 50 AND 12000),
 template_reference text NOT NULL CHECK(length(btrim(template_reference)) BETWEEN 1 AND 120),
 source_references jsonb NOT NULL CHECK(jsonb_typeof(source_references)='array'),
 validation_notice text NOT NULL DEFAULT 'PROPOSED — REQUIRES DOMAIN EXPERT VALIDATION'
 CHECK(validation_notice='PROPOSED — REQUIRES DOMAIN EXPERT VALIDATION')
);
CREATE TABLE case_reasoning_steps(
 assessment_version_id uuid NOT NULL REFERENCES case_blueprints(assessment_version_id),
 item_version_id uuid NOT NULL,
 position integer NOT NULL CHECK(position>0),
 code text NOT NULL CHECK(code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 3 AND 160),
 PRIMARY KEY(assessment_version_id,item_version_id),
 UNIQUE(assessment_version_id,position), UNIQUE(assessment_version_id,code),
 FOREIGN KEY(assessment_version_id,item_version_id) REFERENCES assessment_blueprint(assessment_version_id,item_version_id)
);
ALTER TABLE rubric_criteria ADD CONSTRAINT rubric_identity_item UNIQUE(id,item_version_id);
CREATE TABLE case_rubric_dimensions(
 assessment_version_id uuid NOT NULL,
 item_version_id uuid NOT NULL,
 rubric_criterion_id uuid NOT NULL,
 dimension text NOT NULL CHECK(dimension IN (
 'CLINICAL_KNOWLEDGE','CLINICAL_REASONING','HERD_HEALTH_REASONING','DATA_INTERPRETATION',
 'NUTRITIONAL_REASONING','RISK_IDENTIFICATION','INVESTIGATION_QUALITY','INTERVENTION_PLANNING',
 'PREVENTIVE_THINKING','ECONOMIC_AWARENESS','COMMUNICATION','DOCUMENTATION','PROFESSIONAL_JUDGMENT')),
 PRIMARY KEY(assessment_version_id,item_version_id,rubric_criterion_id,dimension),
 FOREIGN KEY(assessment_version_id,item_version_id) REFERENCES case_reasoning_steps(assessment_version_id,item_version_id),
 FOREIGN KEY(rubric_criterion_id,item_version_id) REFERENCES rubric_criteria(id,item_version_id)
);
CREATE FUNCTION case_metadata_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE av assessment_versions; prior assessment_versions;
BEGIN
 IF TG_OP<>'INSERT' THEN
  SELECT * INTO prior FROM assessment_versions WHERE id=OLD.assessment_version_id FOR UPDATE;
  IF prior.status<>'DRAFT' THEN RAISE EXCEPTION 'Delivered case metadata immutable'; END IF;
 END IF;
 IF TG_OP<>'DELETE' THEN
  SELECT * INTO av FROM assessment_versions WHERE id=NEW.assessment_version_id FOR UPDATE;
  IF av.status<>'DRAFT' OR NOT av.demo OR av.randomize THEN RAISE EXCEPTION 'Case requires ordered demo draft'; END IF;
  IF TG_TABLE_NAME='case_blueprints' THEN
   IF NEW.professional_status<>'DRAFT' OR NEW.effective_at IS NOT NULL THEN RAISE EXCEPTION 'Professional case approval not enabled'; END IF;
  END IF;
  IF TG_TABLE_NAME='case_reasoning_steps' THEN
   IF NOT EXISTS(
   SELECT 1 FROM assessment_item_versions WHERE id=NEW.item_version_id AND type IN ('CASE','REPORT') AND method='CASE' AND evidence_type='CASE_ASSESSED' AND demo AND answer_key IS NULL
   ) THEN RAISE EXCEPTION 'Case stages require human-reviewed case items'; END IF;
  END IF;
  RETURN NEW;
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER case_blueprint_guard BEFORE INSERT OR UPDATE OR DELETE ON case_blueprints FOR EACH ROW EXECUTE FUNCTION case_metadata_guard();
CREATE TRIGGER case_step_guard BEFORE INSERT OR UPDATE OR DELETE ON case_reasoning_steps FOR EACH ROW EXECUTE FUNCTION case_metadata_guard();
CREATE TRIGGER case_dimension_guard BEFORE INSERT OR UPDATE OR DELETE ON case_rubric_dimensions FOR EACH ROW EXECUTE FUNCTION case_metadata_guard();
CREATE FUNCTION case_delivery_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE stage_count integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM case_blueprints WHERE assessment_version_id=NEW.id) THEN RETURN NEW; END IF;
 -- Professional approval is deliberately unavailable until a separately reviewed governance milestone.
 IF NEW.randomize OR NOT NEW.demo OR NEW.status='APPROVED' THEN RAISE EXCEPTION 'Case production approval not enabled'; END IF;
 IF NEW.status='DEMO' AND OLD.status='DRAFT' THEN
  SELECT count(*) INTO stage_count FROM case_reasoning_steps WHERE assessment_version_id=NEW.id;
  IF stage_count=0 OR stage_count<>(SELECT count(*) FROM assessment_blueprint WHERE assessment_version_id=NEW.id)
   OR stage_count<>(SELECT max(position) FROM case_reasoning_steps WHERE assessment_version_id=NEW.id)
   OR EXISTS(SELECT 1 FROM case_reasoning_steps s JOIN assessment_item_versions i ON i.id=s.item_version_id WHERE s.assessment_version_id=NEW.id AND (i.type NOT IN ('CASE','REPORT') OR i.method<>'CASE' OR i.evidence_type<>'CASE_ASSESSED' OR NOT i.demo OR i.answer_key IS NOT NULL))
   OR EXISTS(SELECT 1 FROM assessment_blueprint b JOIN rubric_criteria rc ON rc.item_version_id=b.item_version_id WHERE b.assessment_version_id=NEW.id AND NOT EXISTS(SELECT 1 FROM case_rubric_dimensions d WHERE d.assessment_version_id=NEW.id AND d.rubric_criterion_id=rc.id))
   OR EXISTS(SELECT 1 FROM case_reasoning_steps s WHERE s.assessment_version_id=NEW.id AND NOT EXISTS(SELECT 1 FROM rubric_criteria rc WHERE rc.item_version_id=s.item_version_id))
  THEN RAISE EXCEPTION 'Complete ordered case rubric required'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER case_delivery_guard BEFORE UPDATE ON assessment_versions FOR EACH ROW EXECUTE FUNCTION case_delivery_guard();
