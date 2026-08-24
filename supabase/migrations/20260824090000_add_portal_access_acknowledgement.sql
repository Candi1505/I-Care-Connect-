-- Florence family and participant portal activation evidence.

alter table public.profiles
  add column if not exists portal_relationship text,
  add column if not exists portal_access_acknowledged_at timestamptz,
  add column if not exists portal_access_acknowledgement_version text;

comment on column public.profiles.portal_relationship
  is 'Supervisor-recorded relationship between a family portal account and its linked participant.';
comment on column public.profiles.portal_access_acknowledged_at
  is 'Time the portal account holder accepted Florence confidentiality and least-privilege access conditions.';
comment on column public.profiles.portal_access_acknowledgement_version
  is 'Version of the portal access acknowledgement accepted by the account holder.';
