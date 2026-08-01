\set ON_ERROR_STOP on

-- This test runs after the normal migration/RLS smoke test. pgcrypto has been
-- relocated to the same `extensions` schema used by hosted Supabase.

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","aal":"aal2","role":"authenticated"}',false);

do $$
declare
 v_note_id uuid;
 v_mar_id uuid;
 v_wrong_pin_denied boolean:=false;
begin
 perform public.set_my_signing_pin('246810');

 begin
  perform public.record_progress_note(
   '10000000-0000-0000-0000-000000000002',
   'Daily support',
   'Wrong PIN should not save this note',
   'Final',
   '000000',
   true
  );
 exception when others then
  if sqlerrm='Incorrect PIN' then
   v_wrong_pin_denied:=true;
  else
   raise;
  end if;
 end;

 if not v_wrong_pin_denied then
  raise exception 'An incorrect progress-note PIN was not denied';
 end if;

 select public.record_progress_note(
  '10000000-0000-0000-0000-000000000002',
  'Daily support',
  'Supabase pgcrypto progress-note smoke test',
  'Final',
  '246810',
  true
 ) into v_note_id;

 if v_note_id is null then
  raise exception 'PIN-signed progress-note RPC returned no ID';
 end if;

 select public.record_medication_administration(
  '30000000-0000-0000-0000-000000000002',
  '246810',
  'Administered'::public.mar_status,
  null
 ) into v_mar_id;

 if v_mar_id is null then
  raise exception 'PIN-signed medication RPC returned no ID';
 end if;

 if not exists(
  select 1 from public.progress_notes
  where id=v_note_id
    and staff_id=auth.uid()
    and declaration_confirmed
    and pin_verified
    and signed_at is not null
 ) then
  raise exception 'Signed progress note did not retain declaration/PIN evidence';
 end if;

 if not exists(
  select 1 from public.mar_entries
  where id=v_mar_id
    and staff_id=auth.uid()
    and pin_verified
    and status='Administered'
 ) then
  raise exception 'Signed MAR entry did not retain PIN evidence';
 end if;
end;
$$;

reset role;

do $$
declare
 v_schema text;
 v_hash text;
begin
 select namespace.nspname into v_schema
 from pg_extension extension_record
 join pg_namespace namespace on namespace.oid=extension_record.extnamespace
 where extension_record.extname='pgcrypto';

 if v_schema<>'extensions' then
  raise exception 'PIN smoke test did not run with Supabase-style pgcrypto schema';
 end if;

 select medication_pin_hash into v_hash
 from public.profiles
 where id='00000000-0000-0000-0000-000000000002';

 if v_hash is null or v_hash='246810' or length(v_hash)<20 then
  raise exception 'Signing PIN was not stored as a pgcrypto hash';
 end if;

 if exists(
  select 1 from public.progress_notes
  where content='Wrong PIN should not save this note'
 ) then
  raise exception 'Wrong-PIN progress note was inserted';
 end if;

 if not exists(
  select 1 from public.audit_events
  where actor_id='00000000-0000-0000-0000-000000000002'
    and table_name='profiles'
    and after_data->>'field'='signing_pin'
 ) then
  raise exception 'Signing PIN change was not audited';
 end if;
end;
$$;

select 'PASS' as florence_supabase_pgcrypto_pin_signing_smoke_test;
