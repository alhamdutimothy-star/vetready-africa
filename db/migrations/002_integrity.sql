CREATE FUNCTION check_evidence_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM candidate_profiles WHERE id=NEW.candidate_id AND user_id=NEW.created_by) THEN RAISE EXCEPTION 'Evidence submitter must own candidate profile'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER evidence_owner BEFORE INSERT ON evidence_records FOR EACH ROW EXECUTE FUNCTION check_evidence_owner();
CREATE FUNCTION check_competency_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM evidence_records e JOIN competency_versions cv ON cv.id=e.competency_version_id WHERE e.id=NEW.evidence_id AND e.candidate_id=NEW.candidate_id AND cv.competency_id=NEW.competency_id) THEN RAISE EXCEPTION 'Evidence must belong to same candidate and competency'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER competency_evidence_consistency BEFORE INSERT OR UPDATE ON competency_evidence_links FOR EACH ROW EXECUTE FUNCTION check_competency_evidence();
CREATE FUNCTION protect_pathway_mapping() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version_id uuid;
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') AND EXISTS(SELECT 1 FROM pathway_versions WHERE id=OLD.pathway_version_id AND approval_status IN ('APPROVED','RETIRED')) THEN RAISE EXCEPTION 'Approved pathway mappings are immutable'; END IF;
 IF TG_OP IN ('INSERT','UPDATE') THEN
  version_id=NEW.pathway_version_id;
  IF EXISTS(SELECT 1 FROM pathway_versions WHERE id=version_id AND approval_status IN ('APPROVED','RETIRED')) THEN RAISE EXCEPTION 'Approved pathway mappings are immutable'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER protect_pathway_competencies BEFORE INSERT OR UPDATE OR DELETE ON pathway_competencies FOR EACH ROW EXECUTE FUNCTION protect_pathway_mapping();
