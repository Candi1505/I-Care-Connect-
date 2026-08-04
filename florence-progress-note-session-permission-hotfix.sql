-- Florence progress-note session/permission hotfix
-- Idempotent: preserves all clinical records and keeps the RPC unavailable to anonymous users.

begin;

revoke all on function public.record_progress_note(uuid,text,text,text,text,boolean) from public, anon;
grant execute on function public.record_progress_note(uuid,text,text,text,text,boolean) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

do $verification$
declare
 v_function regprocedure:=to_regprocedure('public.record_progress_note(uuid,text,text,text,text,boolean)');
begin
 if v_function is null then
  raise exception 'record_progress_note function is missing';
 end if;
 if not has_function_privilege('authenticated',v_function,'EXECUTE') then
  raise exception 'authenticated role cannot execute record_progress_note';
 end if;
 if has_function_privilege('anon',v_function,'EXECUTE') then
  raise exception 'anonymous role must not execute record_progress_note';
 end if;
end;
$verification$;
