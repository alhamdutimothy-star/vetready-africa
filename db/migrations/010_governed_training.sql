-- Phase 3B: participation history only. No assessment/evidence/award writes.
INSERT INTO permissions(code) VALUES('training:manage'),('training:assign') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_code,permission_code)
 SELECT r.code,p.code FROM roles r CROSS JOIN permissions p
 WHERE r.code IN ('ADMIN','SUPER_ADMIN') AND p.code IN ('training:manage','training:assign') ON CONFLICT DO NOTHING;

CREATE TABLE training_courses(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text UNIQUE NOT NULL CHECK(code ~ '^[A-Z][A-Z0-9_]{1,79}$'),
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE training_course_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),course_id uuid NOT NULL REFERENCES training_courses(id),
 version integer NOT NULL CHECK(version>0),title text NOT NULL CHECK(length(btrim(title)) BETWEEN 2 AND 160),
 description text NOT NULL DEFAULT '' CHECK(length(description)<=2000),objectives jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(objectives)='array'),
 author_id uuid NOT NULL REFERENCES users(id),source_references jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(source_references)='array'),
 reviewer_id uuid REFERENCES users(id),reviewed_at timestamptz,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','EXPERT_REVIEWED','APPROVED','RETIRED')),
 demo boolean NOT NULL DEFAULT true CHECK(demo),demo_released_at timestamptz,retired_at timestamptz,
 notice text NOT NULL DEFAULT 'DEMO CONTENT — NOT YET APPROVED FOR PRODUCTION TRAINING. PROPOSED — REQUIRES DOMAIN EXPERT VALIDATION. Completion is not competence verification.'
 CHECK(notice='DEMO CONTENT — NOT YET APPROVED FOR PRODUCTION TRAINING. PROPOSED — REQUIRES DOMAIN EXPERT VALIDATION. Completion is not competence verification.'),
 change_actor_id uuid NOT NULL REFERENCES users(id),change_request_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(course_id,version),UNIQUE(id,course_id),
 CHECK(status IN ('DRAFT','RETIRED') AND reviewer_id IS NULL AND reviewed_at IS NULL),
 CHECK((status='RETIRED')=(retired_at IS NOT NULL))
);
CREATE TABLE training_modules(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),course_id uuid NOT NULL REFERENCES training_courses(id),code text NOT NULL CHECK(code ~ '^[A-Z][A-Z0-9_]{1,79}$'),
 UNIQUE(course_id,code),UNIQUE(id,course_id)
);
CREATE TABLE training_module_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),module_id uuid NOT NULL,course_id uuid NOT NULL,course_version_id uuid NOT NULL,
 position integer NOT NULL CHECK(position>0),title text NOT NULL CHECK(length(btrim(title)) BETWEEN 2 AND 160),
 description text NOT NULL DEFAULT '' CHECK(length(description)<=2000),objectives jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(objectives)='array'),
 FOREIGN KEY(module_id,course_id) REFERENCES training_modules(id,course_id),FOREIGN KEY(course_version_id,course_id) REFERENCES training_course_versions(id,course_id),
 UNIQUE(course_version_id,module_id),UNIQUE(course_version_id,position),UNIQUE(id,course_version_id),UNIQUE(id,module_id,course_version_id)
);
CREATE TABLE training_lessons(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),module_id uuid NOT NULL REFERENCES training_modules(id),code text NOT NULL CHECK(code ~ '^[A-Z][A-Z0-9_]{1,79}$'),
 UNIQUE(module_id,code),UNIQUE(id,module_id)
);
CREATE TABLE training_lesson_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lesson_id uuid NOT NULL,module_id uuid NOT NULL,module_version_id uuid NOT NULL,course_version_id uuid NOT NULL,
 position integer NOT NULL CHECK(position>0),title text NOT NULL CHECK(length(btrim(title)) BETWEEN 2 AND 160),
 description text NOT NULL DEFAULT '' CHECK(length(description)<=2000),objectives jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(objectives)='array'),
 body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 5000),
 FOREIGN KEY(lesson_id,module_id) REFERENCES training_lessons(id,module_id),FOREIGN KEY(module_version_id,module_id,course_version_id) REFERENCES training_module_versions(id,module_id,course_version_id),
 UNIQUE(module_version_id,lesson_id),UNIQUE(module_version_id,position),UNIQUE(id,module_version_id,course_version_id)
);
CREATE TABLE training_pathway_links(
 course_version_id uuid NOT NULL REFERENCES training_course_versions(id),pathway_version_id uuid NOT NULL REFERENCES pathway_versions(id),
 PRIMARY KEY(course_version_id,pathway_version_id)
);
CREATE TABLE training_competency_links(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),course_version_id uuid NOT NULL,module_version_id uuid,lesson_version_id uuid,pathway_version_id uuid NOT NULL,
 child_version_id uuid REFERENCES child_competency_versions(id),group_version_id uuid REFERENCES competency_versions(id),
 FOREIGN KEY(course_version_id,pathway_version_id) REFERENCES training_pathway_links(course_version_id,pathway_version_id),
 FOREIGN KEY(module_version_id,course_version_id) REFERENCES training_module_versions(id,course_version_id),
 FOREIGN KEY(lesson_version_id,module_version_id,course_version_id) REFERENCES training_lesson_versions(id,module_version_id,course_version_id),
 CHECK(lesson_version_id IS NULL OR module_version_id IS NOT NULL),CHECK((child_version_id IS NULL)<>(group_version_id IS NULL))
);
CREATE UNIQUE INDEX training_competency_unique ON training_competency_links(course_version_id,module_version_id,lesson_version_id,pathway_version_id,child_version_id,group_version_id) NULLS NOT DISTINCT;
CREATE TABLE training_assessment_links(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),course_version_id uuid NOT NULL REFERENCES training_course_versions(id),module_version_id uuid,lesson_version_id uuid,
 assessment_version_id uuid NOT NULL REFERENCES assessment_versions(id),
 FOREIGN KEY(module_version_id,course_version_id) REFERENCES training_module_versions(id,course_version_id),
 FOREIGN KEY(lesson_version_id,module_version_id,course_version_id) REFERENCES training_lesson_versions(id,module_version_id,course_version_id),
 CHECK(lesson_version_id IS NULL OR module_version_id IS NOT NULL)
);
CREATE UNIQUE INDEX training_assessment_unique ON training_assessment_links(course_version_id,module_version_id,lesson_version_id,assessment_version_id) NULLS NOT DISTINCT;
CREATE TABLE training_enrollments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),candidate_id uuid NOT NULL REFERENCES candidate_profiles(id),course_version_id uuid NOT NULL REFERENCES training_course_versions(id),
 kind text NOT NULL CHECK(kind IN ('SELF','ASSIGNED')),assigned_by uuid NOT NULL REFERENCES users(id),request_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(candidate_id,course_version_id),UNIQUE(id,candidate_id,course_version_id)
);
CREATE TABLE training_lesson_progress(
 enrollment_id uuid NOT NULL,candidate_id uuid NOT NULL,course_version_id uuid NOT NULL,module_version_id uuid NOT NULL,lesson_version_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('IN_PROGRESS','COMPLETED')),resume_position integer NOT NULL CHECK(resume_position>=0),revision integer NOT NULL CHECK(revision>0),
 started_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
 change_actor_id uuid NOT NULL REFERENCES users(id),request_id uuid NOT NULL,
 PRIMARY KEY(enrollment_id,lesson_version_id),
 FOREIGN KEY(enrollment_id,candidate_id,course_version_id) REFERENCES training_enrollments(id,candidate_id,course_version_id),
 FOREIGN KEY(lesson_version_id,module_version_id,course_version_id) REFERENCES training_lesson_versions(id,module_version_id,course_version_id),
 CHECK((state='COMPLETED')=(completed_at IS NOT NULL))
);
CREATE TABLE training_progress_commands(
 enrollment_id uuid NOT NULL,command_id uuid NOT NULL,candidate_id uuid NOT NULL,course_version_id uuid NOT NULL,lesson_version_id uuid NOT NULL,
 expected_revision integer NOT NULL CHECK(expected_revision>=0),requested_state text NOT NULL CHECK(requested_state IN ('IN_PROGRESS','COMPLETED')),
 resume_position integer NOT NULL CHECK(resume_position>=0),result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(enrollment_id,command_id),
 FOREIGN KEY(enrollment_id,candidate_id,course_version_id) REFERENCES training_enrollments(id,candidate_id,course_version_id),
 FOREIGN KEY(enrollment_id,lesson_version_id) REFERENCES training_lesson_progress(enrollment_id,lesson_version_id)
);
CREATE INDEX training_enrollment_owner ON training_enrollments(candidate_id,created_at DESC);
CREATE INDEX training_versions_catalog ON training_course_versions(created_at DESC) WHERE demo_released_at IS NOT NULL AND status='DRAFT';

CREATE FUNCTION training_capability(actor uuid,capability text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM users u JOIN user_role_assignments a ON a.user_id=u.id JOIN role_permissions p ON p.role_code=a.role_code
 WHERE u.id=actor AND u.status='ACTIVE' AND a.role_scope='PLATFORM' AND a.organization_id IS NULL AND (a.expires_at IS NULL OR a.expires_at>now()) AND p.permission_code=capability)
$$;
CREATE FUNCTION training_course_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT training_capability(NEW.created_by,'training:manage') THEN RAISE EXCEPTION 'Training management capability required'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER training_course_owner BEFORE INSERT ON training_courses FOR EACH ROW EXECUTE FUNCTION training_course_identity_guard();
CREATE TRIGGER training_course_identity_fixed BEFORE UPDATE OR DELETE ON training_courses FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER training_module_identity_fixed BEFORE UPDATE OR DELETE ON training_modules FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER training_lesson_identity_fixed BEFORE UPDATE OR DELETE ON training_lessons FOR EACH ROW EXECUTE FUNCTION append_only();

CREATE FUNCTION training_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE latest integer;
BEGIN
 IF NOT training_capability(NEW.change_actor_id,'training:manage') THEN RAISE EXCEPTION 'Training management capability required'; END IF;
 IF TG_OP='INSERT' THEN
  PERFORM 1 FROM training_courses WHERE id=NEW.course_id FOR UPDATE;
  SELECT coalesce(max(version),0) INTO latest FROM training_course_versions WHERE course_id=NEW.course_id;
  IF NEW.version<>latest+1 OR NEW.author_id<>NEW.change_actor_id OR NEW.status<>'DRAFT' OR NEW.demo_released_at IS NOT NULL THEN RAISE EXCEPTION 'New training draft version required'; END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['title','description','objectives','source_references','status','demo_released_at','retired_at','change_actor_id','change_request_id'])<>(to_jsonb(OLD)-ARRAY['title','description','objectives','source_references','status','demo_released_at','retired_at','change_actor_id','change_request_id']) THEN RAISE EXCEPTION 'Training version identity immutable'; END IF;
  IF OLD.status='RETIRED' THEN RAISE EXCEPTION 'Retired training immutable'; END IF;
  IF OLD.demo_released_at IS NOT NULL AND (to_jsonb(NEW)-ARRAY['status','retired_at','change_actor_id','change_request_id'])<>(to_jsonb(OLD)-ARRAY['status','retired_at','change_actor_id','change_request_id']) THEN RAISE EXCEPTION 'Released training immutable'; END IF;
  IF NEW.status<>OLD.status AND NOT (OLD.status='DRAFT' AND NEW.status='RETIRED') THEN RAISE EXCEPTION 'Production training approval disabled'; END IF;
  IF NEW.demo_released_at IS DISTINCT FROM OLD.demo_released_at THEN
   IF OLD.demo_released_at IS NOT NULL OR NEW.demo_released_at IS NULL OR NEW.status<>'DRAFT' THEN RAISE EXCEPTION 'Invalid demo release'; END IF;
   IF NOT EXISTS(SELECT 1 FROM training_pathway_links WHERE course_version_id=NEW.id) OR NOT EXISTS(SELECT 1 FROM training_module_versions WHERE course_version_id=NEW.id) OR EXISTS(SELECT 1 FROM training_module_versions m WHERE m.course_version_id=NEW.id AND NOT EXISTS(SELECT 1 FROM training_lesson_versions l WHERE l.module_version_id=m.id)) THEN RAISE EXCEPTION 'Complete training hierarchy and pathways required'; END IF;
   IF EXISTS(SELECT 1 FROM training_assessment_links t JOIN assessment_versions a ON a.id=t.assessment_version_id WHERE t.course_version_id=NEW.id AND (a.status NOT IN ('DEMO','APPROVED') OR (a.status='DEMO' AND NOT a.demo))) THEN RAISE EXCEPTION 'Released assessment reference required'; END IF;
   IF EXISTS(SELECT 1 FROM training_competency_links t WHERE t.course_version_id=NEW.id AND ((t.child_version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM child_group_mappings m JOIN pathway_competencies p ON p.competency_version_id=m.group_version_id WHERE m.child_version_id=t.child_version_id AND p.pathway_version_id=t.pathway_version_id)) OR (t.group_version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pathway_competencies p WHERE p.competency_version_id=t.group_version_id AND p.pathway_version_id=t.pathway_version_id)))) THEN RAISE EXCEPTION 'Training competency mapping no longer valid'; END IF;
   IF EXISTS(SELECT 1 FROM training_assessment_links t JOIN assessment_versions a ON a.id=t.assessment_version_id WHERE t.course_version_id=NEW.id AND NOT EXISTS(SELECT 1 FROM training_pathway_links p WHERE p.course_version_id=NEW.id AND p.pathway_version_id=a.pathway_version_id)) THEN RAISE EXCEPTION 'Training assessment mapping no longer valid'; END IF;
   IF (SELECT coalesce(sum(length(body)),0) FROM training_lesson_versions WHERE course_version_id=NEW.id)>20000 THEN RAISE EXCEPTION 'Training text size bound exceeded'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_version_valid BEFORE INSERT OR UPDATE ON training_course_versions FOR EACH ROW EXECUTE FUNCTION training_version_guard();
CREATE TRIGGER training_version_no_delete BEFORE DELETE ON training_course_versions FOR EACH ROW EXECUTE FUNCTION append_only();

CREATE FUNCTION training_draft_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v training_course_versions%ROWTYPE; source uuid;
BEGIN
 source:=CASE WHEN TG_OP='DELETE' THEN OLD.course_version_id ELSE NEW.course_version_id END;
 SELECT * INTO v FROM training_course_versions WHERE id=source FOR UPDATE;
 IF v.id IS NULL OR v.status<>'DRAFT' OR v.demo_released_at IS NOT NULL THEN RAISE EXCEPTION 'Training snapshot immutable or missing'; END IF;
 IF TG_OP='UPDATE' AND NEW.course_version_id<>OLD.course_version_id THEN RAISE EXCEPTION 'Training parent immutable'; END IF;
 IF TG_OP<>'DELETE' AND TG_TABLE_NAME='training_competency_links' THEN
  IF NEW.child_version_id IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM child_group_mappings m JOIN pathway_competencies p ON p.competency_version_id=m.group_version_id WHERE m.child_version_id=NEW.child_version_id AND p.pathway_version_id=NEW.pathway_version_id) THEN RAISE EXCEPTION 'Training child/pathway mismatch'; END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM pathway_competencies WHERE pathway_version_id=NEW.pathway_version_id AND competency_version_id=NEW.group_version_id) THEN RAISE EXCEPTION 'Training group/pathway mismatch'; END IF;
 END IF;
 IF TG_OP<>'DELETE' AND TG_TABLE_NAME='training_assessment_links' THEN
  IF NOT EXISTS(SELECT 1 FROM assessment_versions a JOIN training_pathway_links p ON p.pathway_version_id=a.pathway_version_id WHERE a.id=NEW.assessment_version_id AND p.course_version_id=NEW.course_version_id) THEN RAISE EXCEPTION 'Training assessment/pathway mismatch'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER training_modules_draft BEFORE INSERT OR UPDATE OR DELETE ON training_module_versions FOR EACH ROW EXECUTE FUNCTION training_draft_guard();
CREATE TRIGGER training_lessons_draft BEFORE INSERT OR UPDATE OR DELETE ON training_lesson_versions FOR EACH ROW EXECUTE FUNCTION training_draft_guard();
CREATE TRIGGER training_pathways_draft BEFORE INSERT OR UPDATE OR DELETE ON training_pathway_links FOR EACH ROW EXECUTE FUNCTION training_draft_guard();
CREATE TRIGGER training_competencies_draft BEFORE INSERT OR UPDATE OR DELETE ON training_competency_links FOR EACH ROW EXECUTE FUNCTION training_draft_guard();
CREATE TRIGGER training_assessments_draft BEFORE INSERT OR UPDATE OR DELETE ON training_assessment_links FOR EACH ROW EXECUTE FUNCTION training_draft_guard();

CREATE FUNCTION training_enrollment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id uuid; v training_course_versions%ROWTYPE;
BEGIN
 SELECT p.user_id INTO owner_id FROM candidate_profiles p JOIN users u ON u.id=p.user_id WHERE p.id=NEW.candidate_id AND u.status='ACTIVE';
 SELECT * INTO v FROM training_course_versions WHERE id=NEW.course_version_id FOR SHARE;
 IF owner_id IS NULL OR v.id IS NULL OR v.status<>'DRAFT' OR v.demo_released_at IS NULL THEN RAISE EXCEPTION 'Active owner and released demo course required'; END IF;
 IF (NEW.kind='SELF' AND NEW.assigned_by<>owner_id) OR (NEW.kind='ASSIGNED' AND NOT training_capability(NEW.assigned_by,'training:assign')) THEN RAISE EXCEPTION 'Enrollment authority required'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_enrollment_valid BEFORE INSERT ON training_enrollments FOR EACH ROW EXECUTE FUNCTION training_enrollment_guard();
CREATE TRIGGER training_enrollment_fixed BEFORE UPDATE OR DELETE ON training_enrollments FOR EACH ROW EXECUTE FUNCTION append_only();

CREATE FUNCTION training_progress_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id uuid; v training_course_versions%ROWTYPE; text_length integer;
BEGIN
 SELECT p.user_id INTO owner_id FROM training_enrollments e JOIN candidate_profiles p ON p.id=e.candidate_id JOIN users u ON u.id=p.user_id WHERE e.id=NEW.enrollment_id AND e.candidate_id=NEW.candidate_id AND e.course_version_id=NEW.course_version_id AND u.status='ACTIVE';
 IF owner_id IS NULL OR owner_id<>NEW.change_actor_id THEN RAISE EXCEPTION 'Candidate progress owner required'; END IF;
 SELECT * INTO v FROM training_course_versions WHERE id=NEW.course_version_id FOR SHARE;
 IF v.status<>'DRAFT' OR v.demo_released_at IS NULL THEN RAISE EXCEPTION 'Active demo training required'; END IF;
 SELECT length(body) INTO text_length FROM training_lesson_versions WHERE id=NEW.lesson_version_id AND module_version_id=NEW.module_version_id AND course_version_id=NEW.course_version_id;
 IF text_length IS NULL OR NEW.resume_position>text_length THEN RAISE EXCEPTION 'Invalid training lesson or resume position'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.revision<>1 THEN RAISE EXCEPTION 'Initial progress revision required'; END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['state','resume_position','revision','updated_at','completed_at','request_id'])<>(to_jsonb(OLD)-ARRAY['state','resume_position','revision','updated_at','completed_at','request_id']) THEN RAISE EXCEPTION 'Progress identity immutable'; END IF;
  IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Progress revision conflict'; END IF;
  IF OLD.state='COMPLETED' AND (NEW.state<>'COMPLETED' OR NEW.completed_at IS DISTINCT FROM OLD.completed_at) THEN RAISE EXCEPTION 'Completion cannot be erased'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_progress_valid BEFORE INSERT OR UPDATE ON training_lesson_progress FOR EACH ROW EXECUTE FUNCTION training_progress_guard();
CREATE TRIGGER training_progress_no_delete BEFORE DELETE ON training_lesson_progress FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER training_commands_fixed BEFORE UPDATE OR DELETE ON training_progress_commands FOR EACH ROW EXECUTE FUNCTION append_only();

CREATE FUNCTION update_training_progress(enrollment uuid,actor uuid,lesson uuid,command uuid,expected integer,next_state text,resume integer,request uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE e training_enrollments%ROWTYPE; prior training_lesson_progress%ROWTYPE; receipt training_progress_commands%ROWTYPE; l training_lesson_versions%ROWTYPE; output jsonb;
BEGIN
 SELECT * INTO e FROM training_enrollments WHERE id=enrollment FOR UPDATE;
 IF e.id IS NULL OR NOT EXISTS(SELECT 1 FROM candidate_profiles p JOIN users u ON u.id=p.user_id WHERE p.id=e.candidate_id AND p.user_id=actor AND u.status='ACTIVE') THEN RAISE EXCEPTION 'Candidate progress owner required'; END IF;
 SELECT * INTO receipt FROM training_progress_commands WHERE enrollment_id=enrollment AND command_id=command;
 IF FOUND THEN
  IF receipt.lesson_version_id IS DISTINCT FROM lesson OR receipt.expected_revision IS DISTINCT FROM expected OR receipt.requested_state IS DISTINCT FROM next_state OR receipt.resume_position IS DISTINCT FROM resume THEN RAISE EXCEPTION 'Progress command payload conflict'; END IF;
  RETURN receipt.result;
 END IF;
 SELECT * INTO l FROM training_lesson_versions WHERE id=lesson AND course_version_id=e.course_version_id;
 IF l.id IS NULL THEN RAISE EXCEPTION 'Lesson outside enrolled version'; END IF;
 SELECT * INTO prior FROM training_lesson_progress WHERE enrollment_id=enrollment AND lesson_version_id=lesson;
 IF coalesce(prior.revision,0) IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Progress revision conflict'; END IF;
 INSERT INTO training_lesson_progress(enrollment_id,candidate_id,course_version_id,module_version_id,lesson_version_id,state,resume_position,revision,completed_at,change_actor_id,request_id)
 VALUES(e.id,e.candidate_id,e.course_version_id,l.module_version_id,l.id,next_state,resume,1,CASE WHEN next_state='COMPLETED' THEN now() ELSE NULL END,actor,request)
 ON CONFLICT(enrollment_id,lesson_version_id) DO UPDATE SET state=EXCLUDED.state,resume_position=EXCLUDED.resume_position,revision=training_lesson_progress.revision+1,
  completed_at=coalesce(training_lesson_progress.completed_at,EXCLUDED.completed_at),updated_at=now(),request_id=EXCLUDED.request_id
 RETURNING jsonb_build_object('lessonVersionId',lesson_version_id,'state',state,'resumePosition',resume_position,'revision',revision,'completedAt',completed_at,'competenceVerified',false) INTO output;
 INSERT INTO training_progress_commands(enrollment_id,command_id,candidate_id,course_version_id,lesson_version_id,expected_revision,requested_state,resume_position,result)
 VALUES(e.id,command,e.candidate_id,e.course_version_id,lesson,expected,next_state,resume,output);
 RETURN output;
END $$;

CREATE FUNCTION training_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='training_course_versions' THEN
  INSERT INTO audit_events(actor_id,action,resource_type,resource_id,request_id,metadata) VALUES(NEW.change_actor_id,CASE WHEN TG_OP='INSERT' THEN 'training.version.created' WHEN NEW.status='RETIRED' THEN 'training.version.retired' WHEN OLD.demo_released_at IS NULL AND NEW.demo_released_at IS NOT NULL THEN 'training.demo.released' ELSE 'training.draft.edited' END,'training_course_version',NEW.id,NEW.change_request_id,jsonb_build_object('version',NEW.version,'status',NEW.status,'demo',true));
 ELSIF TG_TABLE_NAME='training_enrollments' THEN
  INSERT INTO audit_events(actor_id,action,resource_type,resource_id,request_id,metadata) VALUES(NEW.assigned_by,'training.enrolled','training_enrollment',NEW.id,NEW.request_id,jsonb_build_object('kind',NEW.kind));
 ELSIF TG_OP='INSERT' OR NEW.state<>OLD.state THEN
  INSERT INTO audit_events(actor_id,action,resource_type,resource_id,request_id,metadata) VALUES(NEW.change_actor_id,'training.progress.transitioned','training_enrollment',NEW.enrollment_id,NEW.request_id,jsonb_build_object('lessonVersionId',NEW.lesson_version_id,'state',NEW.state,'revision',NEW.revision,'competenceVerified',false));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_version_audited AFTER INSERT OR UPDATE ON training_course_versions FOR EACH ROW EXECUTE FUNCTION training_audit();
CREATE TRIGGER training_enrollment_audited AFTER INSERT ON training_enrollments FOR EACH ROW EXECUTE FUNCTION training_audit();
CREATE TRIGGER training_progress_audited AFTER INSERT OR UPDATE ON training_lesson_progress FOR EACH ROW EXECUTE FUNCTION training_audit();

-- Preserve the meaning of exact competency versions once used by a released snapshot.
CREATE FUNCTION training_reference_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE child uuid; next_child uuid; group_version uuid;
BEGIN
 IF TG_TABLE_NAME='child_competency_versions' THEN child:=OLD.id;
 ELSIF TG_TABLE_NAME='competency_versions' THEN group_version:=OLD.id;
 ELSE child:=CASE WHEN TG_OP='INSERT' THEN NEW.child_version_id ELSE OLD.child_version_id END; next_child:=CASE WHEN TG_OP='UPDATE' THEN NEW.child_version_id ELSE child END; END IF;
 IF EXISTS(SELECT 1 FROM training_competency_links t JOIN training_course_versions v ON v.id=t.course_version_id WHERE v.demo_released_at IS NOT NULL AND (t.child_version_id IN (child,next_child) OR t.group_version_id=group_version)) THEN RAISE EXCEPTION 'Training referenced competency immutable; create new version'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER training_child_reference_fixed BEFORE UPDATE OR DELETE ON child_competency_versions FOR EACH ROW EXECUTE FUNCTION training_reference_guard();
CREATE TRIGGER training_group_reference_fixed BEFORE UPDATE OR DELETE ON competency_versions FOR EACH ROW EXECUTE FUNCTION training_reference_guard();
CREATE TRIGGER training_criteria_reference_fixed BEFORE UPDATE OR DELETE ON child_criteria FOR EACH ROW EXECUTE FUNCTION training_reference_guard();
CREATE TRIGGER training_child_group_reference_fixed BEFORE UPDATE OR DELETE ON child_group_mappings FOR EACH ROW EXECUTE FUNCTION training_reference_guard();
-- AFTER INSERT skips seed ON CONFLICT no-ops but prevents genuinely new structure.
CREATE TRIGGER training_new_criterion_fixed AFTER INSERT ON child_criteria FOR EACH ROW EXECUTE FUNCTION training_reference_guard();
CREATE TRIGGER training_new_child_group_fixed AFTER INSERT ON child_group_mappings FOR EACH ROW EXECUTE FUNCTION training_reference_guard();

-- An idempotency receipt records the actual technical result, never a client-authored claim.
CREATE FUNCTION training_command_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p training_lesson_progress%ROWTYPE;
BEGIN
 SELECT * INTO p FROM training_lesson_progress WHERE enrollment_id=NEW.enrollment_id AND lesson_version_id=NEW.lesson_version_id;
 IF p.enrollment_id IS NULL OR p.candidate_id<>NEW.candidate_id OR p.course_version_id<>NEW.course_version_id OR NEW.expected_revision<>p.revision-1 OR NEW.requested_state<>p.state OR NEW.resume_position<>p.resume_position OR NEW.result<>jsonb_build_object('lessonVersionId',p.lesson_version_id,'state',p.state,'resumePosition',p.resume_position,'revision',p.revision,'completedAt',p.completed_at,'competenceVerified',false) THEN RAISE EXCEPTION 'Progress receipt must match actual learning state'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_command_valid BEFORE INSERT ON training_progress_commands FOR EACH ROW EXECUTE FUNCTION training_command_guard();
