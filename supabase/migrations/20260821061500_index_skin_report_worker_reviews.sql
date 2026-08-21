-- Cover worker and supervisor review foreign keys used by skin-report history.
create index if not exists skin_observation_reports_reported_by_idx
  on public.skin_observation_reports(reported_by);
create index if not exists skin_observation_reports_reviewed_by_idx
  on public.skin_observation_reports(reviewed_by)
  where reviewed_by is not null;
