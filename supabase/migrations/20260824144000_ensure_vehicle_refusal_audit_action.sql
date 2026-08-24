-- Keep the factual vehicle-refusal support record auditable after legacy SIL
-- schema repair paths that can restore the older access-audit helper.

alter table public.audit_events
  drop constraint if exists audit_events_action_check;

alter table public.audit_events
  add constraint audit_events_action_check
  check (action in (
    'INSERT', 'UPDATE', 'DELETE', 'VIEW', 'DOWNLOAD', 'EXPORT',
    'LOGIN', 'MFA_ENROLLED', 'ACKNOWLEDGE'
  ));

create or replace function public.record_access_event(
  p_action text,
  p_table_name text,
  p_record_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_id bigint;
  v_profile public.profiles%rowtype;
begin
  perform public.require_verified_mfa();
  if p_action not in (
    'INSERT', 'UPDATE', 'DELETE', 'VIEW', 'DOWNLOAD', 'EXPORT',
    'LOGIN', 'MFA_ENROLLED', 'ACKNOWLEDGE'
  ) then
    raise exception 'Unsupported audit action';
  end if;
  if nullif(btrim(coalesce(p_table_name, '')), '') is null then
    raise exception 'Audit table name is required';
  end if;
  if octet_length(coalesce(p_metadata, '{}'::jsonb)::text) > 16384 then
    raise exception 'Audit metadata is too large';
  end if;

  select * into v_profile
  from public.profiles
  where id = auth.uid() and active = true;
  if v_profile.id is null then
    raise exception 'Active Florence profile required';
  end if;

  insert into public.audit_events(
    organisation_id, actor_id, table_name, record_id, action, after_data
  ) values (
    v_profile.organisation_id,
    v_profile.id,
    left(btrim(p_table_name), 80),
    p_record_id,
    p_action,
    coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.record_access_event(text,text,text,jsonb) from public, anon;
grant execute on function public.record_access_event(text,text,text,jsonb) to authenticated;
