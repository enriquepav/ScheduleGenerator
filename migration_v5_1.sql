-- TurnoPro V5.1: ejecutar tras respaldo y despues de migration_v5.sql.
-- No borra registros por si solo. Habilita borrado individual y controlado desde la web.
BEGIN;
CREATE OR REPLACE FUNCTION public.turnopro_delete_employee(p_employee_id uuid, p_store_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.store_managers sm
    JOIN public.profiles p ON p.user_id=sm.user_id
    WHERE sm.store_id=p_store_id AND sm.user_id=auth.uid() AND p.role='manager'
  ) THEN
    RAISE EXCEPTION 'No autorizado para eliminar trabajadores de esta tienda';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id=p_employee_id AND e.store_id=p_store_id) THEN
    RAISE EXCEPTION 'Trabajador no encontrado en la tienda autorizada';
  END IF;
  -- El borrado de asignaciones elimina sus segmentos mediante ON DELETE CASCADE.
  DELETE FROM public.schedule_assignments sa
  WHERE sa.employee_id=p_employee_id
    AND EXISTS (
      SELECT 1 FROM public.schedule_options so
      JOIN public.schedule_batches sb ON sb.id=so.batch_id
      WHERE so.id=sa.option_id AND sb.store_id=p_store_id
    );
  DELETE FROM public.study_blocks WHERE employee_id=p_employee_id;
  DELETE FROM public.employee_restrictions WHERE employee_id=p_employee_id AND store_id=p_store_id;
  DELETE FROM public.employees WHERE id=p_employee_id AND store_id=p_store_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo eliminar el trabajador'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.turnopro_delete_employee(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.turnopro_delete_employee(uuid,uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.turnopro_delete_employee(uuid,uuid) TO authenticated;
COMMIT;
