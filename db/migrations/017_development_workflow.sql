-- Owner-only navigation receipts; participation never changes evidence or qualifications.
CREATE TABLE development_workflow_plans(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),candidate_id uuid NOT NULL REFERENCES candidate_profiles(id),
 pathway_version_id uuid NOT NULL REFERENCES pathway_versions(id),snapshot_id uuid NOT NULL REFERENCES competency_profile_snapshots(id),
 actor_id uuid NOT NULL REFERENCES users(id),command_id uuid NOT NULL,request_id uuid NOT NULL,
 engine_version text NOT NULL DEFAULT 'development-workflow-1' CHECK(engine_version='development-workflow-1'),
 policy_status text NOT NULL DEFAULT 'UNCONFIGURED' CHECK(policy_status='UNCONFIGURED'),
 items jsonb NOT NULL CHECK(jsonb_typeof(items)='array'),items_digest text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(candidate_id,command_id)
);
CREATE INDEX development_workflow_owner ON development_workflow_plans(candidate_id,created_at DESC,id);
CREATE FUNCTION development17_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item jsonb; recommendation jsonb;
BEGIN
 IF NOT training_capability(NEW.actor_id,'candidate:own') OR NOT EXISTS(
 SELECT 1 FROM candidate_profiles p JOIN competency_profile_snapshots s ON s.candidate_id=p.id
 WHERE p.id=NEW.candidate_id AND p.user_id=NEW.actor_id AND s.id=NEW.snapshot_id)
 THEN RAISE EXCEPTION 'Development active snapshot owner required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pathway_versions WHERE id=NEW.pathway_version_id AND approval_status<>'RETIRED')
 THEN RAISE EXCEPTION 'Development pathway unavailable'; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(NEW.items) LOOP
  IF item->>'policyStatus' IS DISTINCT FROM 'UNCONFIGURED' OR item->>'requirement' IS DISTINCT FROM 'NOT_CONFIGURED'
   OR item->>'evidenceState' IS NULL OR item->>'evidenceState' NOT IN ('UNKNOWN','PRESENT') THEN RAISE EXCEPTION 'Development professional decisions unavailable'; END IF;
  IF NOT EXISTS(SELECT 1 FROM child_group_mappings m JOIN pathway_competencies pc ON pc.competency_version_id=m.group_version_id WHERE pc.pathway_version_id=NEW.pathway_version_id AND m.child_version_id=(item->>'childVersionId')::uuid)
   THEN RAISE EXCEPTION 'Development child outside pathway'; END IF;
  FOR recommendation IN SELECT * FROM jsonb_array_elements(item->'recommendations') LOOP
   IF NOT EXISTS(SELECT 1 FROM training_competency_links l JOIN training_course_versions v ON v.id=l.course_version_id
    WHERE l.id=(recommendation->>'mappingId')::uuid AND l.course_version_id=(recommendation->>'courseVersionId')::uuid
    AND l.pathway_version_id=NEW.pathway_version_id AND v.status='DRAFT' AND v.demo AND v.demo_released_at IS NOT NULL
    AND (l.child_version_id=(item->>'childVersionId')::uuid OR EXISTS(SELECT 1 FROM child_group_mappings m WHERE m.group_version_id=l.group_version_id AND m.child_version_id=(item->>'childVersionId')::uuid)))
   THEN RAISE EXCEPTION 'Development explicit released mapping required'; END IF;
  END LOOP;
 END LOOP;
 NEW.items_digest:=encode(sha256(convert_to(profile15_canonical(NEW.items),'UTF8')),'hex');
 RETURN NEW;
END $$;
CREATE FUNCTION development17_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO audit_events(actor_id,action,resource_type,resource_id,request_id,metadata)
 VALUES(NEW.actor_id,'development.workflow.created','development_workflow_plan',NEW.id,NEW.request_id,
 jsonb_build_object('snapshotId',NEW.snapshot_id,'pathwayVersionId',NEW.pathway_version_id,'itemsDigest',NEW.items_digest));
 RETURN NEW;
END $$;
CREATE TRIGGER development_workflow_valid BEFORE INSERT ON development_workflow_plans FOR EACH ROW EXECUTE FUNCTION development17_guard();
CREATE TRIGGER development_workflow_immutable BEFORE UPDATE OR DELETE ON development_workflow_plans FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER development_workflow_audited AFTER INSERT ON development_workflow_plans FOR EACH ROW EXECUTE FUNCTION development17_audit();
CREATE TABLE development_workflow_starts(
 plan_id uuid NOT NULL REFERENCES development_workflow_plans(id),course_version_id uuid NOT NULL REFERENCES training_course_versions(id),
 candidate_id uuid NOT NULL REFERENCES candidate_profiles(id),enrollment_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id),request_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(plan_id,course_version_id),
 FOREIGN KEY(enrollment_id,candidate_id,course_version_id) REFERENCES training_enrollments(id,candidate_id,course_version_id)
);
CREATE FUNCTION development17_start() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT training_capability(NEW.actor_id,'candidate:own') OR NOT EXISTS(
 SELECT 1 FROM development_workflow_plans p JOIN candidate_profiles c ON c.id=p.candidate_id
 JOIN training_course_versions v ON v.id=NEW.course_version_id
 WHERE p.id=NEW.plan_id AND c.id=NEW.candidate_id AND c.user_id=NEW.actor_id
 AND v.status='DRAFT' AND v.demo_released_at IS NOT NULL
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(p.items) i,jsonb_array_elements(i->'recommendations') r WHERE r->>'courseVersionId'=NEW.course_version_id::text))
 THEN RAISE EXCEPTION 'Development current owner and recommendation required'; END IF;
 INSERT INTO audit_events(actor_id,action,resource_type,resource_id,request_id,metadata)
 VALUES(NEW.actor_id,'development.workflow.learning.started','development_workflow_plan',NEW.plan_id,NEW.request_id,
 jsonb_build_object('courseVersionId',NEW.course_version_id,'enrollmentId',NEW.enrollment_id));
 RETURN NEW;
END $$;
CREATE TRIGGER development_workflow_start_valid BEFORE INSERT ON development_workflow_starts FOR EACH ROW EXECUTE FUNCTION development17_start();
CREATE TRIGGER development_workflow_start_immutable BEFORE UPDATE OR DELETE ON development_workflow_starts FOR EACH ROW EXECUTE FUNCTION append_only();
