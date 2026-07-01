alter table public.projects
  add column if not exists current_streak integer not null default 0,
  add column if not exists longest_streak integer not null default 0;

update public.projects
set longest_streak = greatest(coalesce(longest_streak, 0), coalesce(current_streak, 0));
