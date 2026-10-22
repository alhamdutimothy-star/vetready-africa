-- Curriculum overlays existing training snapshots; no awards, thresholds or approval activation.
CREATE TABLE dairy_curricula(
 course_version_id uuid PRIMARY KEY REFERENCES training_course_versions(id),
 domains jsonb NOT NULL CHECK(jsonb_typeof(domains)='array' AND jsonb_array_length(domains)>0),
 author_id uuid NOT NULL REFERENCES users(id),request_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE dairy_learning_units(
 lesson_version_id uuid PRIMARY KEY,course_version_id uuid NOT NULL REFERENCES dairy_curricula(course_version_id),module_version_id uuid NOT NULL,
 domain_code text NOT NULL,content jsonb NOT NULL CHECK(jsonb_typeof(content)='object'),
 FOREIGN KEY(lesson_version_id,module_version_id,course_version_id) REFERENCES training_lesson_versions(id,module_version_id,course_version_id)
);
CREATE FUNCTION dairy_curriculum_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v training_course_versions%ROWTYPE; actor uuid; d jsonb; u jsonb; ch uuid;
BEGIN
 SELECT * INTO v FROM training_course_versions WHERE id=NEW.course_version_id FOR UPDATE;
 IF v.id IS NULL OR v.status<>'DRAFT' OR v.demo_released_at IS NOT NULL THEN RAISE EXCEPTION 'Unreleased training draft required'; END IF;
 SELECT author_id INTO actor FROM dairy_curricula WHERE course_version_id=NEW.course_version_id;
 IF TG_TABLE_NAME='dairy_curricula' THEN actor:=NEW.author_id; END IF;
 IF NOT training_capability(actor,'training:manage') THEN RAISE EXCEPTION 'Training management capability required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM training_pathway_links t JOIN pathway_versions pv ON pv.id=t.pathway_version_id JOIN pathways p ON p.id=pv.pathway_id WHERE t.course_version_id=v.id AND p.code='DAIRY') THEN RAISE EXCEPTION 'Dairy pathway required'; END IF;
 IF TG_TABLE_NAME='dairy_curricula' THEN
  FOR d IN SELECT value FROM jsonb_array_elements(NEW.domains) LOOP
   IF jsonb_typeof(d->'childVersionIds') IS DISTINCT FROM 'array' OR jsonb_array_length(d->'childVersionIds')=0 THEN RAISE EXCEPTION 'Domain competency mappings required'; END IF;
   FOR ch IN SELECT value::text::uuid FROM jsonb_array_elements_text(d->'childVersionIds') LOOP
    IF NOT EXISTS(SELECT 1 FROM training_competency_links t WHERE t.course_version_id=v.id AND t.child_version_id=ch) THEN RAISE EXCEPTION 'Domain competency outside training mappings'; END IF;
   END LOOP;
  END LOOP;
 ELSE
  IF NEW.content->>'domainCode' IS DISTINCT FROM NEW.domain_code OR NOT EXISTS(SELECT 1 FROM dairy_curricula c,jsonb_array_elements(c.domains) domain_entry WHERE c.course_version_id=v.id AND domain_entry->>'code'=NEW.domain_code) THEN RAISE EXCEPTION 'Unit domain mismatch'; END IF;
  IF jsonb_typeof(NEW.content->'prerequisites') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Prerequisite list required'; END IF;
  FOR u IN SELECT value FROM jsonb_array_elements(NEW.content->'prerequisites') LOOP
   ch:=(u->>'childVersionId')::uuid;
   IF NOT EXISTS(SELECT 1 FROM training_competency_links t WHERE t.course_version_id=v.id AND t.child_version_id=ch) THEN RAISE EXCEPTION 'Prerequisite outside training mappings'; END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER dairy_curriculum_valid BEFORE INSERT ON dairy_curricula FOR EACH ROW EXECUTE FUNCTION dairy_curriculum_guard();
CREATE TRIGGER dairy_unit_valid BEFORE INSERT ON dairy_learning_units FOR EACH ROW EXECUTE FUNCTION dairy_curriculum_guard();
CREATE TRIGGER dairy_curriculum_fixed BEFORE UPDATE OR DELETE ON dairy_curricula FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER dairy_unit_fixed BEFORE UPDATE OR DELETE ON dairy_learning_units FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE FUNCTION dairy_curriculum_release_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.demo_released_at IS DISTINCT FROM OLD.demo_released_at AND EXISTS(SELECT 1 FROM dairy_curricula WHERE course_version_id=NEW.id) THEN
  IF EXISTS(SELECT 1 FROM training_lesson_versions l WHERE l.course_version_id=NEW.id AND NOT EXISTS(SELECT 1 FROM dairy_learning_units u WHERE u.lesson_version_id=l.id)) THEN RAISE EXCEPTION 'Every curriculum lesson requires a governed unit'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER dairy_curriculum_complete BEFORE UPDATE ON training_course_versions FOR EACH ROW EXECUTE FUNCTION dairy_curriculum_release_guard();
CREATE TABLE dairy_learning_activities(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),enrollment_id uuid NOT NULL REFERENCES training_enrollments(id),
 lesson_version_id uuid NOT NULL REFERENCES dairy_learning_units(lesson_version_id),
 actor_id uuid NOT NULL REFERENCES users(id),command_id uuid NOT NULL,revision integer NOT NULL CHECK(revision>0),
 response text NOT NULL CHECK(length(btrim(response)) BETWEEN 1 AND 4000),request_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(enrollment_id,command_id),UNIQUE(enrollment_id,lesson_version_id,revision)
);
CREATE FUNCTION dairy_activity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v uuid; owner_id uuid; latest integer;
BEGIN
 SELECT e.course_version_id,p.user_id INTO v,owner_id FROM training_enrollments e JOIN candidate_profiles p ON p.id=e.candidate_id JOIN users usr ON usr.id=p.user_id WHERE e.id=NEW.enrollment_id AND usr.status='ACTIVE' FOR UPDATE OF e;
 IF owner_id IS DISTINCT FROM NEW.actor_id THEN RAISE EXCEPTION 'Candidate activity owner required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM dairy_learning_units u JOIN training_course_versions c ON c.id=u.course_version_id WHERE u.lesson_version_id=NEW.lesson_version_id AND c.id=v AND c.status='DRAFT' AND c.demo_released_at IS NOT NULL) THEN RAISE EXCEPTION 'Active enrolled learning unit required'; END IF;
 SELECT coalesce(max(revision),0) INTO latest FROM dairy_learning_activities WHERE enrollment_id=NEW.enrollment_id AND lesson_version_id=NEW.lesson_version_id;
 IF NEW.revision<>latest+1 THEN RAISE EXCEPTION 'Activity revision conflict'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER dairy_activity_valid BEFORE INSERT ON dairy_learning_activities FOR EACH ROW EXECUTE FUNCTION dairy_activity_guard();
CREATE TRIGGER dairy_activity_fixed BEFORE UPDATE OR DELETE ON dairy_learning_activities FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE FUNCTION dairy_learning_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='dairy_curricula' THEN
 INSERT INTO audit_events(actor_id,action,resource_type,resource_id,request_id,metadata) VALUES(NEW.author_id,'dairy.curriculum.created','training_course_version',NEW.course_version_id,NEW.request_id,'{"competenceVerified":false}'::jsonb);
 ELSIF TG_TABLE_NAME='dairy_learning_activities' THEN
 INSERT INTO audit_events(actor_id,action,resource_type,resource_id,request_id,metadata) VALUES(NEW.actor_id,'dairy.learning.activity.saved','training_enrollment',NEW.enrollment_id,NEW.request_id,jsonb_build_object('lessonVersionId',NEW.lesson_version_id,'revision',NEW.revision,'competenceVerified',false));
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER dairy_curriculum_audited AFTER INSERT ON dairy_curricula FOR EACH ROW EXECUTE FUNCTION dairy_learning_audit();
CREATE TRIGGER dairy_activity_audited AFTER INSERT ON dairy_learning_activities FOR EACH ROW EXECUTE FUNCTION dairy_learning_audit();
