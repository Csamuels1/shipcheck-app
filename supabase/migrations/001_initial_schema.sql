create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null,
  builder_type text not null default 'Solo builder',
  plan text not null default 'Free Trial',
  trial_started_at timestamptz not null default now(),
  onboarding_forecast_seen boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  plan text not null default 'Free Trial',
  seat_limit integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text not null default '',
  type text not null default 'MVP/Product',
  status text not null default 'Planning',
  start_date date not null default current_date,
  target_launch_date date not null,
  weekly_available_hours numeric not null default 10,
  baseline_locked_at date not null default current_date,
  team_size integer not null default 1,
  shipped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create table if not exists public.scope_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text not null default '',
  column_key text not null default 'ship',
  rank_order integer not null default 1,
  estimate_hours numeric not null default 1,
  confidence text not null default 'medium',
  status text not null default 'not-started',
  existed_at_baseline boolean not null default true,
  approved_scope_change boolean not null default false,
  added_reason text not null default '',
  completed_at date,
  movement_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.build_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  log_date date not null default current_date,
  minutes_spent integer not null,
  summary text not null,
  blockers text not null default '',
  scope_item_id uuid references public.scope_items(id) on delete set null,
  new_scope_added boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  payload jsonb not null default '{}'::jsonb,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text not null default 'Free Trial',
  status text not null default 'trialing',
  seat_limit integer not null default 1,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.workspaces enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.scope_items enable row level security;
alter table public.build_logs enable row level security;
alter table public.weekly_reports enable row level security;
alter table public.billing_subscriptions enable row level security;

create policy "Users can read own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

create policy "Members can read organizations" on public.organizations
  for select using (exists (
    select 1 from public.organization_members m
    where m.organization_id = organizations.id and m.user_id = auth.uid()
  ));

create policy "Members can read organization membership" on public.organization_members
  for select using (user_id = auth.uid() or exists (
    select 1 from public.organization_members m
    where m.organization_id = organization_members.organization_id and m.user_id = auth.uid()
  ));

create policy "Members can read workspaces" on public.workspaces
  for select using (exists (
    select 1 from public.organization_members m
    where m.organization_id = workspaces.organization_id and m.user_id = auth.uid()
  ));

create policy "Project members can manage projects" on public.projects
  for all using (exists (
    select 1 from public.project_members m
    where m.project_id = projects.id and m.user_id = auth.uid()
  )) with check (owner_id = auth.uid());

create policy "Project members can read members" on public.project_members
  for select using (exists (
    select 1 from public.project_members m
    where m.project_id = project_members.project_id and m.user_id = auth.uid()
  ));

create policy "Project members can manage scope" on public.scope_items
  for all using (exists (
    select 1 from public.project_members m
    where m.project_id = scope_items.project_id and m.user_id = auth.uid()
  ));

create policy "Project members can manage logs" on public.build_logs
  for all using (exists (
    select 1 from public.project_members m
    where m.project_id = build_logs.project_id and m.user_id = auth.uid()
  ));

create policy "Project members can read reports" on public.weekly_reports
  for select using (exists (
    select 1 from public.project_members m
    where m.project_id = weekly_reports.project_id and m.user_id = auth.uid()
  ));

create policy "Organization members can read billing" on public.billing_subscriptions
  for select using (exists (
    select 1 from public.organization_members m
    where m.organization_id = billing_subscriptions.organization_id and m.user_id = auth.uid()
  ));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  new_workspace_id uuid;
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''), new.email);

  insert into public.organizations (owner_id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', 'My Workspace'))
  returning id into new_org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_org_id, new.id, 'owner');

  insert into public.workspaces (organization_id, name)
  values (new_org_id, 'Default workspace')
  returning id into new_workspace_id;

  insert into public.billing_subscriptions (organization_id)
  values (new_org_id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
