CREATE FUNCTION phase2_link_freeze() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item uuid; child uuid;
BEGIN
 IF TG_TABLE_NAME='rubric_criteria' THEN
  item:=COALESCE(NEW.item_version_id,OLD.item_version_id);
  IF EXISTS(SELECT 1 FROM assessment_blueprint b JOIN assessment_versions v ON v.id=b.assessment_version_id WHERE b.item_version_id=item AND v.status<>'DRAFT') THEN RAISE EXCEPTION 'Delivered rubric immutable'; END IF;
  IF TG_OP<>'DELETE' AND NOT EXISTS(SELECT 1 FROM assessment_blueprint WHERE item_version_id=NEW.item_version_id AND child_version_id=NEW.child_version_id) THEN RAISE EXCEPTION 'Rubric must map to blueprint child'; END IF;
 ELSE
  child:=COALESCE(NEW.child_version_id,OLD.child_version_id);
  IF EXISTS(SELECT 1 FROM child_competency_versions WHERE id=child AND validation_status IN ('APPROVED','RETIRED')) OR EXISTS(SELECT 1 FROM assessment_blueprint b JOIN assessment_versions v ON v.id=b.assessment_version_id WHERE b.child_version_id=child AND v.status<>'DRAFT') THEN RAISE EXCEPTION 'Referenced child structure immutable'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER rubric_frozen BEFORE INSERT OR UPDATE OR DELETE ON rubric_criteria FOR EACH ROW EXECUTE FUNCTION phase2_link_freeze();
CREATE TRIGGER criteria_frozen BEFORE INSERT OR UPDATE OR DELETE ON child_criteria FOR EACH ROW EXECUTE FUNCTION phase2_link_freeze();
CREATE TRIGGER child_mapping_frozen BEFORE INSERT OR UPDATE OR DELETE ON child_group_mappings FOR EACH ROW EXECUTE FUNCTION phase2_link_freeze();
CREATE FUNCTION phase2_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM assessment_attempts a JOIN assessment_versions v ON v.id=a.assessment_version_id JOIN assessment_blueprint b ON b.assessment_version_id=v.id JOIN assessment_item_versions i ON i.id=b.item_version_id WHERE a.id=NEW.attempt_id AND a.candidate_id=NEW.candidate_id AND b.item_version_id=NEW.item_version_id AND b.child_version_id=NEW.child_version_id AND i.evidence_type=NEW.facet AND v.demo=NEW.demo) THEN RAISE EXCEPTION 'Evidence provenance mismatch'; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['status','observation','valid_until'])<>(to_jsonb(OLD)-ARRAY['status','observation','valid_until']) THEN RAISE EXCEPTION 'Evidence provenance immutable'; END IF;
 IF NEW.status='VERIFIED' THEN
  IF NEW.demo OR NEW.facet IN ('PRACTICALLY_VERIFIED','WORKPLACE_VERIFIED','SIMULATION_VERIFIED') OR NEW.observation NOT IN ('CORRECT','DEMONSTRATED') THEN RAISE EXCEPTION 'Evidence not eligible for verification'; END IF;
  IF NOT EXISTS(SELECT 1 FROM child_competency_versions WHERE id=NEW.child_version_id AND validation_status='APPROVED') THEN RAISE EXCEPTION 'Validated child required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM competency_evidence_reviews WHERE evidence_id=NEW.id AND outcome='VERIFIED') THEN RAISE EXCEPTION 'Human verification decision required'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER evidence_provenance BEFORE INSERT OR UPDATE ON competency_evidence FOR EACH ROW EXECUTE FUNCTION phase2_evidence_guard();
CREATE TRIGGER evidence_no_delete BEFORE DELETE ON competency_evidence FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER observation_immutable BEFORE UPDATE OR DELETE ON rubric_observations FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER plan_immutable BEFORE UPDATE OR DELETE ON development_plans FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE FUNCTION phase2_child_freeze_delivered() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM assessment_blueprint b JOIN assessment_versions v ON v.id=b.assessment_version_id WHERE b.child_version_id=OLD.id AND v.status<>'DRAFT') THEN RAISE EXCEPTION 'Delivered child version immutable; create new version'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER delivered_child_frozen BEFORE UPDATE OR DELETE ON child_competency_versions FOR EACH ROW EXECUTE FUNCTION phase2_child_freeze_delivered();
