# TurnoPro — aplicación web de horarios (MVP funcional)

## Qué incluye

- Acceso por correo y contraseña con Supabase Auth (administrador y gerente).
- Gestión de tiendas y asociación de gerentes existentes.
- Importación estandarizada XLSX con pestañas `Personal` y `Estudios`.
- Registro individual de personal, restricciones de estudio y períodos de vigencia.
- Turnos configurables, cobertura por área/día, parámetros de descanso y traslado.
- Motor heurístico en navegador para generar varias propuestas, puntuar y mostrar incidencias.
- Edición manual de turnos, aprobación con validación, exportación XLSX y PDF por impresión del navegador.
- Enlaces de confirmación de restricciones mediante Supabase Edge Function (sin cuentas para trabajadores).

## Puesta en marcha

1. Crea un proyecto en https://supabase.com/dashboard .
2. En **SQL Editor**, ejecuta `schema.sql` completo en un proyecto nuevo (no lo ejecutes dos veces).
3. En **Authentication → Providers**, habilita Email. En **Authentication → Users**, crea un usuario administrador con contraseña fuerte; copia su UUID.
4. En SQL Editor, reemplaza los valores del siguiente ejemplo y ejecútalo:

```sql
insert into public.profiles(user_id,role,dni,full_name)
values ('UUID-DEL-ADMIN','admin','00000000','Administrador General');
```

5. Crea gerentes en Authentication → Users; por cada uno ejecuta:

```sql
insert into public.profiles(user_id,role,dni,full_name)
values ('UUID-DEL-GERENTE','manager','12345678','Gerente de Tienda');
```

6. Copia `config.example.js` a `config.js`. Edita `supabaseUrl` y `supabaseAnonKey` con la URL del proyecto y la clave **publishable/anon**, nunca `service_role`. El archivo `config.js` del ZIP trae marcadores para completar.
7. Para ver localmente, desde esta carpeta ejecuta `python3 -m http.server 8000` y visita `http://localhost:8000`.
8. Ingresa como administrador, crea una tienda, selecciona la tienda y asigna el UUID del gerente en **Administración**. Configura turnos y cobertura en **Turnos y cobertura**.
9. En **Personal y estudios**, descarga y completa la plantilla. Las pestañas se llaman exactamente `Personal` y `Estudios`; los cargos válidos son `part_time`, `full_time`, `entrenador`, `asistente`, `gerente` y las áreas `produccion`, `servicio`, `gerencial`.
10. En **Generar horarios**, elige un lunes y genera propuestas. Corrige las incidencias antes de aprobar. Exporta a XLSX o usa **Imprimir / guardar PDF** (destino PDF del navegador).

## Confirmación mediante enlaces

Instala Supabase CLI, inicia sesión y enlaza el proyecto:

```bash
npx supabase login
npx supabase link --project-ref TU-PROJECT-REF
npx supabase functions deploy verify-restrictions --no-verify-jwt
```

La función valida por sí misma la autenticación para generar enlaces y tokens aleatorios para consultas/confirmaciones. `--no-verify-jwt` permite abrir los enlaces públicos sin iniciar sesión; no desactiva las verificaciones implementadas dentro de la función. Enlaces válidos por siete días.

## Publicación en GitHub Pages

1. Crea un repositorio público en GitHub, por ejemplo `turnopro`.
2. Sube `index.html`, `verify.html`, `app.js`, `engine.js`, `style.css`, `config.js`, `plantilla_personal_estudios.xlsx` a la **raíz**. No subas archivos con datos reales ni secretos. Puedes mantener `schema.sql` y `supabase/functions` en el repositorio si lo deseas.
3. En Settings → Pages → Build and deployment → Deploy from a branch, selecciona `main` y `/(root)`.
4. Abre `https://TU-USUARIO.github.io/turnopro/`.
5. En Supabase → Authentication → URL Configuration, agrega el dominio y la ruta de GitHub Pages a **Redirect URLs** y define el Site URL según corresponda.
6. Usa **HTTPS**. `config.js` será público: solo contiene la clave pública y la URL. Nunca uses `service_role` en el frontend.

## Consideraciones y límites del MVP

- El algoritmo es **heurístico**, no un solucionador matemático exacto. Puede devolver propuestas incompletas cuando no encuentra asignaciones; esas propuestas mostrarán incidencias y no se podrán aprobar.
- Para trabajadores full time/entrenador/asistente/gerente se exigen bloques de 8 horas. Part Time puede trabajar bloques cortos salvo amanecida, que requiere 8 horas. El motor intenta cubrir la demanda y no garantiza exactamente 19.5 h para cada Part Time: revisa las horas antes de publicar.
- El campo de cobertura representa **cantidad de personas asignadas por turno**, no cobertura minuto a minuto. Una asignación corta de Part Time cuenta como una persona del turno. Para producción real conviene ampliar a cobertura por franjas de 30 minutos.
- El motor valida descanso mínimo, disponibilidad académica y límites semanales; la regla de dos amanecidas y descanso posterior es una preferencia de puntuación, no un bloqueo.
- La regla de gerente o asistente presente se verifica por turno, no minuto a minuto. Con una sola persona gerencial en tienda y tres turnos, la semana puede ser inviable.
- El administrador debe configurar turnos, cobertura y personal antes de generar. No hay recuperación automática de contraseñas en esta interfaz: se gestiona desde Supabase Auth.
- El horario manual actual permite seleccionar turnos completos o descanso. No incluye editor de horas parciales; el motor sí genera algunos bloques parciales para Part Time.
- Las confirmaciones anteriores deben invalidarse cuando se cambien restricciones: esta versión requiere volver a generar el enlace; no automatiza esa invalidación al editar restricciones. **No uses la confirmación como prueba inmutable de una versión específica de estudios.**
- No se implementó optimización global ni control laboral legal específico para Perú; valida convenios, refrigerios, máximos diarios, descanso semanal y trabajo nocturno antes de uso productivo.
- Para uso productivo, incorporar pruebas automatizadas, triggers de integridad por tienda, revisión de concurrencia, auditoría y generación de reportes de cumplimiento de horas.
