create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'member');
  end if;

  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type public.task_status as enum ('todo', 'doing', 'done');
  end if;

  if not exists (select 1 from pg_type where typname = 'task_priority') then
    create type public.task_priority as enum ('low', 'normal', 'high');
  end if;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role public.app_role not null default 'member',
  color text not null default '#2f6fed',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status public.task_status not null default 'todo',
  priority public.task_priority not null default 'normal',
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create index if not exists tasks_starts_at_idx on public.tasks(starts_at);
create index if not exists tasks_created_by_idx on public.tasks(created_by);
create index if not exists task_assignees_user_id_idx on public.task_assignees(user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case
      when new.raw_user_meta_data ->> 'role' = 'admin' then 'admin'::public.app_role
      else 'member'::public.app_role
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'admin'::public.app_role;
$$;

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read
on public.profiles for select
to authenticated
using (true);

drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin
on public.profiles for update
to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

drop policy if exists tasks_read_visible on public.tasks;
create policy tasks_read_visible
on public.tasks for select
to authenticated
using (
  public.is_admin()
  or created_by = auth.uid()
  or exists (
    select 1 from public.task_assignees ta
    where ta.task_id = tasks.id and ta.user_id = auth.uid()
  )
);

drop policy if exists tasks_insert_own on public.tasks;
create policy tasks_insert_own
on public.tasks for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists tasks_update_owner_or_admin on public.tasks;
drop policy if exists tasks_update_visible on public.tasks;
create policy tasks_update_visible
on public.tasks for update
to authenticated
using (
  public.is_admin()
  or created_by = auth.uid()
  or exists (
    select 1 from public.task_assignees ta
    where ta.task_id = tasks.id and ta.user_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or created_by = auth.uid()
  or exists (
    select 1 from public.task_assignees ta
    where ta.task_id = tasks.id and ta.user_id = auth.uid()
  )
);

drop policy if exists tasks_delete_owner_or_admin on public.tasks;
create policy tasks_delete_owner_or_admin
on public.tasks for delete
to authenticated
using (created_by = auth.uid());

drop policy if exists task_assignees_read_visible on public.task_assignees;
create policy task_assignees_read_visible
on public.task_assignees for select
to authenticated
using (
  user_id = auth.uid()
  or assigned_by = auth.uid()
  or public.is_admin()
  or exists (
    select 1 from public.tasks t
    where t.id = task_id and t.created_by = auth.uid()
  )
);

drop policy if exists task_assignees_insert_owner_or_admin on public.task_assignees;
create policy task_assignees_insert_owner_or_admin
on public.task_assignees for insert
to authenticated
with check (
  public.is_admin()
  or assigned_by = auth.uid()
  or exists (
    select 1 from public.tasks t
    where t.id = task_id and t.created_by = auth.uid()
  )
);

drop policy if exists task_assignees_delete_owner_or_admin on public.task_assignees;
create policy task_assignees_delete_owner_or_admin
on public.task_assignees for delete
to authenticated
using (
  public.is_admin()
  or assigned_by = auth.uid()
  or exists (
    select 1 from public.tasks t
    where t.id = task_id and t.created_by = auth.uid()
  )
);
