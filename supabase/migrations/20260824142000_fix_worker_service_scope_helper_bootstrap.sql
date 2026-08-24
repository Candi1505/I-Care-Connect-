begin;

create or replace function public.worker_service_allowed(
  p_staff_id uuid,
  p_service_type text
) returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if to_regclass('public.worker_service_scopes') is null then
    return public.is_supervisor();
  end if;

  return public.is_supervisor()
    or not exists (
      select 1
      from public.worker_service_scopes scope
      where scope.staff_id = p_staff_id
        and scope.active
    )
    or exists (
      select 1
      from public.worker_service_scopes scope
      where scope.staff_id = p_staff_id
        and scope.service_type = p_service_type
        and scope.active
    );
end;
$$;

revoke all on function public.worker_service_allowed(uuid, text) from public, anon;
grant execute on function public.worker_service_allowed(uuid, text) to authenticated;

commit;
