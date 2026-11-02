-- TurnoPro V5. Ejecutar UNA VEZ tras respaldo, sobre esquema V4 existente.
-- No borra trabajadores, horarios, cuentas ni estudios.
BEGIN;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS can_production boolean NOT NULL DEFAULT false;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS can_service boolean NOT NULL DEFAULT false;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS primary_area text;
UPDATE public.employees SET can_production=true WHERE area='produccion' AND NOT can_production AND NOT can_service;
UPDATE public.employees SET can_service=true WHERE area='servicio' AND NOT can_production AND NOT can_service;
UPDATE public.employees SET primary_area=area WHERE primary_area IS NULL;
UPDATE public.employees SET weekly_hours=48, work_days=6 WHERE role IN ('gerente','asistente');
UPDATE public.employees SET work_days=6 WHERE role='part_time';
ALTER TABLE public.employees ADD CONSTRAINT employees_v5_primary_area CHECK (primary_area IN ('produccion','servicio','gerencial'));
CREATE TABLE IF NOT EXISTS public.employee_restrictions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
 employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('personal','study','vacation')),
 weekday integer CHECK(weekday BETWEEN 1 AND 7),
 starts_at time, ends_at time,
 date_from date, date_to date,
 notes text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((weekday IS NOT NULL) OR (date_from IS NOT NULL)),
 CHECK (date_to IS NULL OR date_from IS NOT NULL),
 CHECK (ends_at IS NULL OR starts_at IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS public.manager_meetings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
 meeting_date date NOT NULL,
 meeting_start time NOT NULL, meeting_end time NOT NULL,
 absence_start time NOT NULL, absence_end time NOT NULL,
 notes text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(meeting_start < meeting_end), CHECK(absence_start < absence_end)
);
CREATE TABLE IF NOT EXISTS public.manager_preferences (
 store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
 preferred_shift text NOT NULL DEFAULT 'ninguna' CHECK(preferred_shift IN ('ninguna','Apertura','Cierre','Amanecida')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.external_replacements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
 replacement_date date NOT NULL,
 starts_at time NOT NULL, ends_at time NOT NULL,
 full_name text NOT NULL, origin_store text NOT NULL DEFAULT '',
 notes text NOT NULL DEFAULT '',
 CHECK(starts_at <> ends_at)
);
-- Segmentos por área en una misma jornada, sin cambiar el esquema histórico de asignaciones.
CREATE TABLE IF NOT EXISTS public.assignment_segments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 assignment_id uuid NOT NULL REFERENCES public.schedule_assignments(id) ON DELETE CASCADE,
 area text NOT NULL CHECK(area IN ('produccion','servicio','gerencial')),
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 CHECK(ends_at>starts_at)
);
CREATE INDEX IF NOT EXISTS employee_restrictions_employee_idx ON public.employee_restrictions(employee_id);
CREATE INDEX IF NOT EXISTS manager_meetings_store_date_idx ON public.manager_meetings(store_id,meeting_date);
CREATE INDEX IF NOT EXISTS replacement_store_date_idx ON public.external_replacements(store_id,replacement_date);
CREATE INDEX IF NOT EXISTS segments_assignment_idx ON public.assignment_segments(assignment_id);
ALTER TABLE public.employee_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manager_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manager_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_replacements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_segments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS v5_restrictions ON public.employee_restrictions;
CREATE POLICY v5_restrictions ON public.employee_restrictions FOR ALL TO authenticated USING(public.manages_store(store_id) AND public.manages_employee(employee_id)) WITH CHECK(public.manages_store(store_id) AND public.manages_employee(employee_id));
DROP POLICY IF EXISTS v5_meetings ON public.manager_meetings;
CREATE POLICY v5_meetings ON public.manager_meetings FOR ALL TO authenticated USING(public.manages_store(store_id)) WITH CHECK(public.manages_store(store_id));
DROP POLICY IF EXISTS v5_preferences ON public.manager_preferences;
CREATE POLICY v5_preferences ON public.manager_preferences FOR ALL TO authenticated USING(public.manages_store(store_id)) WITH CHECK(public.manages_store(store_id));
DROP POLICY IF EXISTS v5_replacements ON public.external_replacements;
CREATE POLICY v5_replacements ON public.external_replacements FOR ALL TO authenticated USING(public.manages_store(store_id)) WITH CHECK(public.manages_store(store_id));
DROP POLICY IF EXISTS v5_segments ON public.assignment_segments;
CREATE POLICY v5_segments ON public.assignment_segments FOR ALL TO authenticated USING(public.manages_option((SELECT option_id FROM public.schedule_assignments WHERE id=assignment_id))) WITH CHECK(public.manages_option((SELECT option_id FROM public.schedule_assignments WHERE id=assignment_id)));
-- Integridad de tienda en tablas dependientes; evita mezclar empleados de otras tiendas.
CREATE OR REPLACE FUNCTION public.v5_check_restriction_store() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.employees e WHERE e.id=NEW.employee_id AND e.store_id=NEW.store_id) THEN RAISE EXCEPTION 'El empleado no pertenece a la tienda'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS v5_restriction_store ON public.employee_restrictions;
CREATE TRIGGER v5_restriction_store BEFORE INSERT OR UPDATE ON public.employee_restrictions FOR EACH ROW EXECUTE FUNCTION public.v5_check_restriction_store();
CREATE OR REPLACE FUNCTION public.v5_validate_segment() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a record;
BEGIN
 SELECT starts_at,ends_at,area,option_id INTO a FROM public.schedule_assignments WHERE id=NEW.assignment_id;
 IF NOT FOUND OR NEW.starts_at<a.starts_at OR NEW.ends_at>a.ends_at THEN RAISE EXCEPTION 'Segmento fuera de jornada'; END IF;
 IF EXISTS(SELECT 1 FROM public.schedule_options WHERE id=a.option_id AND status='approved') THEN RAISE EXCEPTION 'Horario aprobado no editable'; END IF;
 IF EXISTS(SELECT 1 FROM public.assignment_segments s WHERE s.assignment_id=NEW.assignment_id AND s.id<>NEW.id AND s.starts_at<NEW.ends_at AND NEW.starts_at<s.ends_at) THEN RAISE EXCEPTION 'Segmentos solapados'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS v5_segment_check ON public.assignment_segments;
CREATE TRIGGER v5_segment_check BEFORE INSERT OR UPDATE ON public.assignment_segments FOR EACH ROW EXECUTE FUNCTION public.v5_validate_segment();
COMMIT;
