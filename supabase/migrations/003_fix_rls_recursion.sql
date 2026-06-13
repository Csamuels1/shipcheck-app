create or replace function public.is_org_member(target_organization_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_organization_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_project_member(target_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.project_members m
    where m.project_id = target_project_id
      and m.user_id = auth.uid()
  );
$$;

drop policy if exists "Members can read organizations" on public.organizations;
drop policy if exists "Members can read organization membership" on public.organization_members;
drop policy if exists "Members can read workspaces" on public.workspaces;
drop policy if exists "Owners and project members can manage projects" on public.projects;
drop policy if exists "Project members can manage membership" on public.project_members;
drop policy if exists "Project members can manage scope" on public.scope_items;
drop policy if exists "Project members can manage logs" on public.build_logs;
drop policy if exists "Project members can read reports" on public.weekly_reports;
drop policy if exists "Organization members can read billing" on public.billing_subscriptions;
drop policy if exists "Organization members can create workspaces" on public.workspaces;
drop policy if exists "Organization members can update workspaces" on public.workspaces;

create policy "Members can read organizations" on public.organizations
  for select using (public.is_org_member(id));

create policy "Users can read own organization membership" on public.organization_members
  for select using (user_id = auth.uid() or public.is_org_member(organization_id));

create policy "Organization owners can manage membership" on public.organization_members
  for all using (exists (
    select 1 from public.organizations o
    where o.id = organization_members.organization_id
      and o.owner_id = auth.uid()
  )) with check (exists (
    select 1 from public.organizations o
    where o.id = organization_members.organization_id
      and o.owner_id = auth.uid()
  ));

create policy "Members can read workspaces" on public.workspaces
  for select using (public.is_org_member(organization_id));

create policy "Organization members can create workspaces" on public.workspaces
  for insert with check (public.is_org_member(organization_id));

create policy "Organization members can update workspaces" on public.workspaces
  for update using (public.is_org_member(organization_id));

create policy "Owners and project members can manage projects" on public.projects
  for all using (owner_id = auth.uid() or public.is_project_member(id))
  with check (owner_id = auth.uid());

create policy "Project members can manage membership" on public.project_members
  for all using (
    user_id = auth.uid()
    or exists (
      select 1 from public.projects p
      where p.id = project_members.project_id
        and p.owner_id = auth.uid()
    )
  ) with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.projects p
      where p.id = project_members.project_id
        and p.owner_id = auth.uid()
    )
  );

create policy "Project members can manage scope" on public.scope_items
  for all using (public.is_project_member(project_id));

create policy "Project members can manage logs" on public.build_logs
  for all using (public.is_project_member(project_id));

create policy "Project members can read reports" on public.weekly_reports
  for select using (public.is_project_member(project_id));

create policy "Organization members can read billing" on public.billing_subscriptions
  for select using (public.is_org_member(organization_id));
