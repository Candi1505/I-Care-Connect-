-- Portal relationship and acknowledgement evidence may only be changed by
-- Florence's trusted server-side account setup functions.

create or replace function public.protect_portal_access_evidence()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin')
     and (
       new.portal_relationship is distinct from old.portal_relationship
       or new.portal_access_acknowledged_at is distinct from old.portal_access_acknowledged_at
       or new.portal_access_acknowledgement_version is distinct from old.portal_access_acknowledgement_version
     ) then
    raise exception 'Portal access evidence is managed by Florence account setup';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_portal_access_evidence_trigger on public.profiles;
create trigger protect_portal_access_evidence_trigger
before update of portal_relationship, portal_access_acknowledged_at, portal_access_acknowledgement_version
on public.profiles
for each row execute function public.protect_portal_access_evidence();

revoke all on function public.protect_portal_access_evidence() from public, anon, authenticated;
