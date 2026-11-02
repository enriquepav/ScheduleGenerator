-- Ejecutar en SQL Editor. No modifica datos.
SELECT e.dni,e.full_name,e.id AS employee_id, count(s.id) AS clases
FROM public.employees e
JOIN public.stores t ON t.id=e.store_id
LEFT JOIN public.study_blocks s ON s.employee_id=e.id
WHERE t.code='PH88'
GROUP BY e.dni,e.full_name,e.id
ORDER BY clases DESC,e.full_name;

-- Si el SQL muestra clases pero la web no, verificar RLS con sesión del gerente.
SELECT policyname,cmd,roles,qual FROM pg_policies WHERE schemaname='public' AND tablename='study_blocks';
