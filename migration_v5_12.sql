-- TurnoPro V5.12: confirmación independiente de gerenciales.
-- Ejecutar DESPUÉS de migration_v5.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS public.manager_schedule_confirmations (
 option_id uuid PRIMARY KEY REFERENCES public.schedule_options(id) ON DELETE CASCADE,
 store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
 week_start date NOT NULL,
 confirmed_by uuid NOT NULL REFERENCES auth.users(id),
 confirmed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS manager_confirmations_store_week ON public.manager_schedule_confirmations(store_id,week_start);
ALTER TABLE public.manager_schedule_confirmations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS manager_confirmation_access ON public.manager_schedule_confirmations;
CREATE POLICY manager_confirmation_access ON public.manager_schedule_confirmations FOR ALL TO authenticated
 USING(public.manages_store(store_id) AND public.manages_option(option_id))
 WITH CHECK(public.manages_store(store_id) AND public.manages_option(option_id) AND confirmed_by=auth.uid());
CREATE OR REPLACE FUNCTION public.v512_check_confirmation() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_option uuid; v_store uuid; v_week date;
BEGIN
 SELECT o.id,b.store_id,b.week_start INTO v_option,v_store,v_week
 FROM public.schedule_options o JOIN public.schedule_batches b ON b.id=o.batch_id
 WHERE o.id=NEW.option_id;
 IF v_option IS NULL OR v_store<>NEW.store_id OR v_week<>NEW.week_start THEN
  RAISE EXCEPTION 'La confirmación no corresponde a la tienda y semana de la propuesta';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS v512_confirmation_check ON public.manager_schedule_confirmations;
CREATE TRIGGER v512_confirmation_check BEFORE INSERT OR UPDATE ON public.manager_schedule_confirmations
 FOR EACH ROW EXECUTE FUNCTION public.v512_check_confirmation();
-- Bloqueo en base de datos: ningún cliente puede alterar jornadas gerenciales confirmadas.
CREATE OR REPLACE FUNCTION public.v512_lock_manager_assignments() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_option uuid; v_employee uuid; v_role text;
BEGIN
 v_option:=CASE WHEN TG_OP='DELETE' THEN OLD.option_id ELSE NEW.option_id END;
 v_employee:=CASE WHEN TG_OP='DELETE' THEN OLD.employee_id ELSE NEW.employee_id END;
 SELECT role INTO v_role FROM public.employees WHERE id=v_employee;
 IF v_role IN ('gerente','asistente') AND EXISTS
  (SELECT 1 FROM public.manager_schedule_confirmations WHERE option_id=v_option) THEN
  RAISE EXCEPTION 'Horario gerencial confirmado: desbloquear antes de editar';
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS v512_manager_lock ON public.schedule_assignments;
CREATE TRIGGER v512_manager_lock BEFORE INSERT OR UPDATE OR DELETE ON public.schedule_assignments
 FOR EACH ROW EXECUTE FUNCTION public.v512_lock_manager_assignments();
COMMIT;
