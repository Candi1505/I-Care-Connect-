-- Florence Supabase pgcrypto PIN-signing hotfix — 2 August 2026
--
-- Purpose:
--   * fixes `function crypt(text, text) does not exist` when a worker signs
--     a progress note or medication record in hosted Supabase;
--   * preserves every account, signing-PIN hash, participant record, MAR entry
--     and progress note;
--   * keeps MFA, participant access, declaration and audit controls unchanged.
--
-- Supabase installs most extensions in the trusted `extensions` schema. The
-- original security-definer functions restricted their search path to
-- `public,pg_temp`, so they could not resolve pgcrypto's crypt()/gen_salt().
--
-- Run once in the live I-Care Connect project pbbsaquwumxyrhqhnobv.
-- This migration is additive, non-destructive and safe to re-run.

begin;

do $requirements$
declare
 v_pgcrypto_schema text;
begin
 if to_regclass('public.profiles') is null
    or to_regclass('public.progress_notes') is null
    or to_regclass('public.medications') is null
    or to_regclass('public.mar_entries') is null
    or to_regclass('public.audit_events') is null
    or to_regprocedure('public.require_verified_mfa()') is null
    or to_regprocedure('public.can_access_participant(uuid)') is null then
  raise exception 'Florence production-hardening prerequisites are missing. Do not continue.';
 end if;

 select namespace.nspname
 into v_pgcrypto_schema
 from pg_extension extension_record
 join pg_namespace namespace on namespace.oid=extension_record.extnamespace
 where extension_record.extname='pgcrypto';

 if v_pgcrypto_schema is null then
  raise exception 'The pgcrypto extension is not enabled in this Supabase project.';
 end if;

 if v_pgcrypto_schema not in('extensions','public') then
  raise exception 'pgcrypto is installed in unsupported schema %. Review before continuing.',v_pgcrypto_schema;
 end if;

 if to_regprocedure(format('%I.crypt(text,text)',v_pgcrypto_schema)) is null
    or to_regprocedure(format('%I.gen_salt(text)',v_pgcrypto_schema)) is null then
  raise exception 'pgcrypto is installed, but crypt(text,text) or gen_salt(text) is unavailable.';
 end if;
end;
$requirements$;

create or replace function public.set_my_signing_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
 v_org uuid;
begin
 perform public.require_verified_mfa();
 if p_pin is null or p_pin !~ '^[0-9]{6}$' then
  raise exception 'PIN must contain exactly six numbers';
 end if;

 update public.profiles
 set medication_pin_hash=crypt(p_pin,gen_salt('bf')),
     updated_at=now()
 where id=auth.uid()
   and active=true
   and role in('staff','supervisor')
 returning organisation_id into v_org;

 if v_org is null then
  raise exception 'Active staff profile not found';
 end if;

 insert into public.audit_events(
  organisation_id,actor_id,table_name,record_id,action,after_data
 ) values(
  v_org,auth.uid(),'profiles',auth.uid()::text,'UPDATE',
  jsonb_build_object('field','signing_pin','result','changed')
 );
end;
$$;
revoke all on function public.set_my_signing_pin(text) from public;
grant execute on function public.set_my_signing_pin(text) to authenticated;

create or replace function public.record_medication_administration(
 p_medication_id uuid,
 p_pin text,
 p_status public.mar_status default 'Administered',
 p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
 v_profile public.profiles%rowtype;
 v_medication public.medications%rowtype;
 v_entry_id uuid;
begin
 perform public.require_verified_mfa();
 select * into v_profile
 from public.profiles
 where id=auth.uid() and active=true;

 if v_profile.id is null or v_profile.role not in('supervisor','staff') then
  raise exception 'Only active staff can record medication administration';
 end if;
 if p_pin is null or p_pin !~ '^[0-9]{6}$' then
  raise exception 'Enter your six-digit signing PIN';
 end if;
 if v_profile.medication_pin_hash is null
    or crypt(p_pin,v_profile.medication_pin_hash)<>v_profile.medication_pin_hash then
  raise exception 'Incorrect medication PIN';
 end if;

 select * into v_medication
 from public.medications
 where id=p_medication_id
   and organisation_id=v_profile.organisation_id
   and active=true;

 if v_medication.id is null then
  raise exception 'Medication is not available';
 end if;
 if not public.can_access_participant(v_medication.participant_id) then
  raise exception 'You are not authorised for this participant';
 end if;
 if v_medication.ceased_at is not null and v_medication.ceased_at<=current_date then
  raise exception 'This medication has been ceased';
 end if;
 if v_medication.hold_from is not null
    and v_medication.hold_from<=current_date
    and (v_medication.hold_until is null or v_medication.hold_until>=current_date) then
  raise exception 'This medication is currently on hold';
 end if;
 if p_status<>'Administered'::public.mar_status
    and nullif(btrim(coalesce(p_notes,'')),'') is null then
  raise exception 'A reason is required when medication is not administered';
 end if;

 insert into public.mar_entries(
  organisation_id,medication_id,participant_id,staff_id,status,pin_verified,notes
 ) values(
  v_profile.organisation_id,v_medication.id,v_medication.participant_id,
  v_profile.id,p_status,true,nullif(btrim(coalesce(p_notes,'')),'')
 ) returning id into v_entry_id;

 return v_entry_id;
end;
$$;
revoke all on function public.record_medication_administration(uuid,text,public.mar_status,text) from public;
grant execute on function public.record_medication_administration(uuid,text,public.mar_status,text) to authenticated;

create or replace function public.record_progress_note(
 p_participant_id uuid,
 p_category text,
 p_content text,
 p_status text,
 p_pin text,
 p_declaration_confirmed boolean
) returns uuid
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
 v_profile public.profiles%rowtype;
 v_note_id uuid;
 v_status text;
begin
 perform public.require_verified_mfa();
 select * into v_profile
 from public.profiles
 where id=auth.uid() and active=true;

 if v_profile.id is null or v_profile.role not in('supervisor','staff') then
  raise exception 'Only active staff can sign progress notes';
 end if;
 if p_declaration_confirmed is not true then
  raise exception 'Confirm that the progress note is true and correct';
 end if;
 if nullif(btrim(coalesce(p_category,'')),'') is null then
  raise exception 'Progress note category is required';
 end if;
 if nullif(btrim(coalesce(p_content,'')),'') is null then
  raise exception 'Progress note content is required';
 end if;

 v_status:=coalesce(nullif(btrim(p_status),''),'Final');
 if v_status not in('Final','Draft') then
  raise exception 'Progress note status is not valid';
 end if;
 if p_pin is null or p_pin !~ '^[0-9]{6}$' then
  raise exception 'Enter your six-digit signing PIN';
 end if;
 if v_profile.medication_pin_hash is null
    or crypt(p_pin,v_profile.medication_pin_hash)<>v_profile.medication_pin_hash then
  raise exception 'Incorrect PIN';
 end if;
 if not public.can_access_participant(p_participant_id) then
  raise exception 'You are not authorised for this participant';
 end if;

 insert into public.progress_notes(
  organisation_id,participant_id,staff_id,category,content,status,
  declaration_confirmed,pin_verified,signed_at
 ) values(
  v_profile.organisation_id,p_participant_id,v_profile.id,btrim(p_category),
  btrim(p_content),v_status,true,true,now()
 ) returning id into v_note_id;

 return v_note_id;
end;
$$;
revoke all on function public.record_progress_note(uuid,text,text,text,text,boolean) from public;
grant execute on function public.record_progress_note(uuid,text,text,text,text,boolean) to authenticated;

commit;

-- Verify pgcrypto itself before reporting success.
do $verification$
declare
 v_pgcrypto_schema text;
 v_test_hash text;
begin
 select namespace.nspname
 into v_pgcrypto_schema
 from pg_extension extension_record
 join pg_namespace namespace on namespace.oid=extension_record.extnamespace
 where extension_record.extname='pgcrypto';

 execute format(
  'select %I.crypt($1,%I.gen_salt(''bf''))',
  v_pgcrypto_schema,v_pgcrypto_schema
 ) using 'Florence verification only' into v_test_hash;

 if v_test_hash is null or length(v_test_hash)<20 then
  raise exception 'pgcrypto verification failed after the PIN-signing repair';
 end if;
end;
$verification$;

notify pgrst, 'reload schema';

select
 case
  when to_regprocedure('public.set_my_signing_pin(text)') is null then 'FAIL_SET_PIN_FUNCTION'
  when to_regprocedure('public.record_medication_administration(uuid,text,public.mar_status,text)') is null then 'FAIL_MAR_FUNCTION'
  when to_regprocedure('public.record_progress_note(uuid,text,text,text,text,boolean)') is null then 'FAIL_PROGRESS_NOTE_FUNCTION'
  else 'PIN_SIGNING_CRYPTO_READY'
 end as florence_pin_signing_repair,
 (
  select namespace.nspname
  from pg_extension extension_record
  join pg_namespace namespace on namespace.oid=extension_record.extnamespace
  where extension_record.extname='pgcrypto'
 ) as pgcrypto_schema,
 (select count(*) from public.profiles where medication_pin_hash is not null) as existing_pin_hashes_preserved,
 (select count(*) from public.progress_notes) as existing_progress_notes_preserved,
 (select count(*) from public.mar_entries) as existing_mar_entries_preserved;
