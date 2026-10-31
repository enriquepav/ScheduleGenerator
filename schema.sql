-- Ejecutar en Supabase SQL Editor. Autenticación mediante Supabase Auth.
create extension if not exists pgcrypto;
create table public.stores (id uuid primary key default gen_random_uuid(), name text not null, code text unique not null, active boolean not null default true, created_at timestamptz not null default now());
create table public.profiles (user_id uuid primary key references auth.users(id) on delete cascade, role text not null check(role in ('admin','manager')), dni text unique, full_name text not null, created_at timestamptz default now());
create table public.store_managers (store_id uuid references public.stores(id) on delete cascade, user_id uuid references public.profiles(user_id) on delete cascade, primary key(store_id,user_id));
create table public.employees (id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id) on delete cascade, dni text not null, full_name text not null, area text not null check(area in ('produccion','servicio','gerencial')), role text not null check(role in ('part_time','full_time','entrenador','asistente','gerente')), weekly_hours numeric(5,2) not null, work_days integer not null check(work_days between 1 and 7), active boolean not null default true, unique(store_id,dni), check(weekly_hours>0));
create table public.study_blocks (id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id) on delete cascade, weekday integer not null check(weekday between 1 and 7), starts_at time not null, ends_at time not null, valid_from date, valid_until date, check(starts_at<ends_at));
create table public.shifts (id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id) on delete cascade, name text not null, starts_at time not null, ends_at time not null, is_overnight boolean not null default false, unique(store_id,name));
create table public.staffing_requirements (id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id) on delete cascade, shift_id uuid not null references public.shifts(id) on delete cascade, weekday integer not null check(weekday between 1 and 7), area text not null check(area in ('produccion','servicio')), minimum_staff integer not null check(minimum_staff>=0), unique(store_id,shift_id,weekday,area));
create table public.store_rules (store_id uuid primary key references public.stores(id) on delete cascade, study_travel_minutes integer not null default 120, min_rest_minutes integer not null default 720, max_manager_nights integer not null default 1, config jsonb not null default '{}'::jsonb);
create table public.verification_links (id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id) on delete cascade, token_hash text not null unique, expires_at timestamptz not null, confirmed_at timestamptz, needs_correction_at timestamptz, revoked_at timestamptz, revision integer not null default 1);
create table public.schedule_batches (id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id) on delete cascade, week_start date not null, created_by uuid references public.profiles(user_id), created_at timestamptz default now());
create table public.schedule_options (id uuid primary key default gen_random_uuid(), batch_id uuid not null references public.schedule_batches(id) on delete cascade, score numeric(12,2), status text not null default 'draft' check(status in ('draft','approved','archived')), created_at timestamptz default now());
create table public.schedule_assignments (id uuid primary key default gen_random_uuid(), option_id uuid not null references public.schedule_options(id) on delete cascade, employee_id uuid not null references public.employees(id), shift_date date not null, starts_at timestamptz not null, ends_at timestamptz not null, area text not null check(area in ('produccion','servicio','gerencial')), check(ends_at>starts_at));
create unique index one_approved_option_per_batch on public.schedule_options(batch_id) where status='approved';
create index employees_store_idx on public.employees(store_id);
create index study_employee_idx on public.study_blocks(employee_id);
create index assignments_option_idx on public.schedule_assignments(option_id);
create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where user_id=(select auth.uid()) and role='admin') $$;
create function public.manages_store(p_store uuid) returns boolean language sql stable security definer set search_path='' as $$ select public.is_admin() or exists(select 1 from public.store_managers where store_id=p_store and user_id=(select auth.uid())) $$;
create function public.manages_employee(p_employee uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.employees where id=p_employee and public.manages_store(store_id)) $$;
create function public.manages_batch(p_batch uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.schedule_batches where id=p_batch and public.manages_store(store_id)) $$;
create function public.manages_option(p_option uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.schedule_options where id=p_option and public.manages_batch(batch_id)) $$;
-- RLS: acceso por tienda; las operaciones de administración de usuarios deben hacerse por función segura/Edge Function.
do $$ declare t text; begin foreach t in array array['stores','profiles','store_managers','employees','study_blocks','shifts','staffing_requirements','store_rules','verification_links','schedule_batches','schedule_options','schedule_assignments'] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;
create policy stores_select on public.stores for select to authenticated using(public.manages_store(id));
create policy stores_admin on public.stores for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy profiles_select on public.profiles for select to authenticated using(user_id=(select auth.uid()) or public.is_admin());
create policy profiles_admin on public.profiles for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy store_managers_select on public.store_managers for select to authenticated using(public.manages_store(store_id));
create policy store_managers_admin on public.store_managers for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy employees_access on public.employees for all to authenticated using(public.manages_store(store_id)) with check(public.manages_store(store_id));
create policy study_access on public.study_blocks for all to authenticated using(public.manages_employee(employee_id)) with check(public.manages_employee(employee_id));
create policy shifts_access on public.shifts for all to authenticated using(public.manages_store(store_id)) with check(public.manages_store(store_id));
create policy staffing_access on public.staffing_requirements for all to authenticated using(public.manages_store(store_id)) with check(public.manages_store(store_id));
create policy rules_access on public.store_rules for all to authenticated using(public.manages_store(store_id)) with check(public.manages_store(store_id));
create policy verification_access on public.verification_links for all to authenticated using(public.manages_employee(employee_id)) with check(public.manages_employee(employee_id));
create policy batches_access on public.schedule_batches for all to authenticated using(public.manages_store(store_id)) with check(public.manages_store(store_id));
create policy options_access on public.schedule_options for all to authenticated using(public.manages_batch(batch_id)) with check(public.manages_batch(batch_id));
create policy assignments_access on public.schedule_assignments for all to authenticated using(public.manages_option(option_id)) with check(public.manages_option(option_id));
-- Nunca exponer service_role en GitHub Pages. Los enlaces de confirmación requieren una Edge Function que valide token hash, expiración y revisión.
-- Endurecimiento: los enlaces de verificación solo se gestionan desde la Edge Function.
drop policy if exists verification_access on public.verification_links;
-- No dar acceso directo a clientes autenticados a tokens de verificación.
-- El rol service_role de la función es el único que puede operar esta tabla.
-- Evitar que un gerente edite propuestas aprobadas desde la interfaz no reemplaza
-- la protección en BD: activar trigger para impedir cambios en asignaciones aprobadas.
create or replace function public.prevent_approved_assignment_changes() returns trigger language plpgsql set search_path='' as $$
declare v_option uuid; begin
v_option := coalesce(new.option_id,old.option_id);
if exists(select 1 from public.schedule_options where id=v_option and status='approved') then raise exception 'No se puede modificar un horario aprobado'; end if;
return coalesce(new,old);
end $$;
create trigger assignments_lock before insert or update or delete on public.schedule_assignments for each row execute function public.prevent_approved_assignment_changes();
