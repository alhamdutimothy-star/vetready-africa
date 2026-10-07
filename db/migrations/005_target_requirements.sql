-- Role targets reuse child versions; approved professional requirements are never seeded.
CREATE TABLE role_child_requirements(
 role_profile_id uuid NOT NULL REFERENCES role_profiles(id),child_version_id uuid NOT NULL REFERENCES child_competency_versions(id),
 proposed_facets text[] NOT NULL,mandatory boolean,validation_status text NOT NULL DEFAULT 'PROPOSED' CHECK(validation_status IN ('PROPOSED','APPROVED')),
 PRIMARY KEY(role_profile_id,child_version_id),CHECK(mandatory IS NULL OR validation_status='APPROVED'),
 CHECK(proposed_facets <@ ARRAY['SELF_DECLARED','DOCUMENT_VERIFIED','KNOWLEDGE_ASSESSED','CASE_ASSESSED','SIMULATION_VERIFIED','PRACTICALLY_VERIFIED','WORKPLACE_VERIFIED']::text[])
);
ALTER TABLE development_plans ADD COLUMN role_profile_id uuid REFERENCES role_profiles(id);
CREATE FUNCTION phase2_requirement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pv uuid;
BEGIN
 IF TG_TABLE_NAME='role_child_requirements' THEN SELECT pathway_version_id INTO pv FROM role_profiles WHERE id=NEW.role_profile_id;
 ELSE pv:=NEW.pathway_version_id; END IF;
 IF NOT EXISTS(SELECT 1 FROM child_group_mappings m JOIN pathway_competencies pc ON pc.competency_version_id=m.group_version_id WHERE m.child_version_id=NEW.child_version_id AND pc.pathway_version_id=pv) THEN RAISE EXCEPTION 'Target child must belong to pathway'; END IF;
 IF NEW.validation_status='APPROVED' AND NOT EXISTS(SELECT 1 FROM child_competency_versions WHERE id=NEW.child_version_id AND validation_status='APPROVED') THEN RAISE EXCEPTION 'Professional requirement needs validated child'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pathway_requirement_valid BEFORE INSERT OR UPDATE ON pathway_child_requirements FOR EACH ROW EXECUTE FUNCTION phase2_requirement_guard();
CREATE TRIGGER role_requirement_valid BEFORE INSERT OR UPDATE ON role_child_requirements FOR EACH ROW EXECUTE FUNCTION phase2_requirement_guard();
CREATE FUNCTION phase2_verification_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='VERIFIED' THEN
  IF NOT EXISTS(SELECT 1 FROM assessment_attempts a JOIN assessment_versions av ON av.id=a.assessment_version_id JOIN assessment_item_versions i ON i.id=NEW.item_version_id WHERE a.id=NEW.attempt_id AND a.status='REVIEWED' AND av.status='APPROVED' AND i.validation_status='APPROVED') THEN RAISE EXCEPTION 'Approved content and human review required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM competency_evidence_reviews er JOIN assessment_attempts a ON a.id=NEW.attempt_id JOIN candidate_profiles p ON p.id=a.candidate_id WHERE er.evidence_id=NEW.id AND er.outcome='VERIFIED' AND er.reviewer_id=a.assigned_assessor_id AND er.reviewer_id<>p.user_id) THEN RAISE EXCEPTION 'Assigned independent assessor required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM assessment_moderations m JOIN assessor_reviews r ON r.id=m.review_id JOIN candidate_profiles p ON p.id=NEW.candidate_id WHERE r.attempt_id=NEW.attempt_id AND m.outcome='CONFIRMED' AND m.moderator_id<>r.assessor_id AND m.moderator_id<>p.user_id AND NOT EXISTS(SELECT 1 FROM assessment_moderations later WHERE later.review_id=m.review_id AND later.created_at>m.created_at)) THEN RAISE EXCEPTION 'Independent moderation required'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER verification_integrity BEFORE INSERT OR UPDATE ON competency_evidence FOR EACH ROW EXECUTE FUNCTION phase2_verification_guard();
