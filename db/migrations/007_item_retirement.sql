-- Retirement is an append-only event; delivered question content remains intact.
CREATE TABLE assessment_item_retirements(item_version_id uuid PRIMARY KEY REFERENCES assessment_item_versions(id),retired_by uuid NOT NULL REFERENCES users(id),reason text NOT NULL CHECK(length(reason)>=10),retired_at timestamptz NOT NULL DEFAULT now());
CREATE TRIGGER retirement_immutable BEFORE UPDATE OR DELETE ON assessment_item_retirements FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE FUNCTION phase2_retired_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.status='VERIFIED' AND EXISTS(SELECT 1 FROM assessment_item_retirements WHERE item_version_id=NEW.item_version_id) THEN RAISE EXCEPTION 'Retired item cannot verify new evidence'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER retired_verification BEFORE INSERT OR UPDATE ON competency_evidence FOR EACH ROW EXECUTE FUNCTION phase2_retired_evidence_guard();
