drop policy if exists "Project members can manage projects" on public.projects;
create policy "Owners and project members can manage projects" on public.projects
  for all using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.project_members m
      where m.project_id = projects.id and m.user_id = auth.uid()
    )
  ) with check (owner_id = auth.uid());

drop policy if exists "Project members can read members" on public.project_members;
create policy "Project members can manage membership" on public.project_members
  for all using (
    user_id = auth.uid()
    or exists (
      select 1 from public.projects p
      where p.id = project_members.project_id and p.owner_id = auth.uid()
    )
  ) with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.projects p
      where p.id = project_members.project_id and p.owner_id = auth.uid()
    )
  );

create policy "Users can create owned organizations" on public.organizations
  for insert with check (owner_id = auth.uid());

create policy "Organization owners can update organizations" on public.organizations
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "Organization members can create workspaces" on public.workspaces
  for insert with check (exists (
    select 1 from public.organization_members m
    where m.organization_id = workspaces.organization_id and m.user_id = auth.uid()
  ));

create policy "Organization members can update workspaces" on public.workspaces
  for update using (exists (
    select 1 from public.organization_members m
    where m.organization_id = workspaces.organization_id and m.user_id = auth.uid()
  ));
