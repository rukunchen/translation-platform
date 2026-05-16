-- Tighten profile visibility and keep invitation tokens as minimal bearer secrets.
-- Run after 06_rls_policies.sql in existing environments.

create or replace function public.can_view_profile(p_profile_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select
    p_profile_id = auth.uid()
    or exists (
      select 1
      from public.project_members viewer
      join public.project_members target
        on target.project_id = viewer.project_id
      where viewer.user_id = auth.uid()
        and target.user_id = p_profile_id
    );
$$;

alter table public.profiles enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (public.can_view_profile(id));
