-- Verification must be based on the latest human review, not a superseded decision.
CREATE OR REPLACE FUNCTION phase2_verification_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='VERIFIED' THEN
  IF NOT EXISTS(SELECT 1 FROM assessment_attempts a JOIN assessment_versions av ON av.id=a.assessment_version_id JOIN assessment_item_versions i ON i.id=NEW.item_version_id WHERE a.id=NEW.attempt_id AND a.status='REVIEWED' AND av.status='APPROVED' AND i.validation_status='APPROVED') THEN RAISE EXCEPTION 'Approved content and human review required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM competency_evidence_reviews er JOIN assessment_attempts a ON a.id=NEW.attempt_id JOIN candidate_profiles p ON p.id=a.candidate_id WHERE er.evidence_id=NEW.id AND er.outcome='VERIFIED' AND er.reviewer_id=a.assigned_assessor_id AND er.reviewer_id<>p.user_id) THEN RAISE EXCEPTION 'Assigned independent assessor required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM assessment_moderations m JOIN assessor_reviews r ON r.id=m.review_id JOIN candidate_profiles p ON p.id=NEW.candidate_id WHERE r.attempt_id=NEW.attempt_id AND m.outcome='CONFIRMED' AND NOT EXISTS(SELECT 1 FROM assessor_reviews r2 WHERE r2.attempt_id=r.attempt_id AND (r2.created_at,r2.id)>(r.created_at,r.id)) AND m.moderator_id<>r.assessor_id AND m.moderator_id<>p.user_id AND NOT EXISTS(SELECT 1 FROM assessment_moderations later WHERE later.review_id=m.review_id AND later.created_at>m.created_at)) THEN RAISE EXCEPTION 'Independent moderation required'; END IF;
 END IF;
 RETURN NEW;
END $$;
