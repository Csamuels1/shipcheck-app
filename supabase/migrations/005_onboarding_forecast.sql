alter table public.profiles
  add column if not exists onboarding_forecast_seen boolean not null default false;

update public.profiles
set onboarding_forecast_seen = false
where onboarding_forecast_seen is null;
