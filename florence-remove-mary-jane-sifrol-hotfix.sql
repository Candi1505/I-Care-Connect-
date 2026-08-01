-- Florence known demo-record cleanup hotfix — 1 August 2026
-- Run once only in the live Florence Supabase project after the final-readiness migration.
-- This fixes the original cleanup matching only participants.full_name even though Florence
-- displays participants.preferred_name first. It safely removes the single Mary Jane demo
-- participant and the Sifrol demo medication together with dependent demo records.

begin;

do $cleanup$
declare
 v_participant_id uuid;
 v_participant_org uuid;
 v_participant_count integer;
 v_sifrol_id uuid;
 v_sifrol_participant uuid;
 v_sifrol_count integer;
 v_linked_profiles text;
 v_document_count integer;
 v_shift_ids uuid[];
 v_incident_ids uuid[];
 v_complaint_ids uuid[];
begin
 select count(*) into v_participant_count
 from public.participants
 where regexp_replace(lower(coalesce(full_name,'')),'[^a-z0-9]+','','g')='maryjane'
    or regexp_replace(lower(coalesce(preferred_name,'')),'[^a-z0-9]+','','g')='maryjane';

 select id,organisation_id into v_participant_id,v_participant_org
 from public.participants
 where regexp_replace(lower(coalesce(full_name,'')),'[^a-z0-9]+','','g')='maryjane'
    or regexp_replace(lower(coalesce(preferred_name,'')),'[^a-z0-9]+','','g')='maryjane'
 order by created_at,id
 limit 1;

 if v_participant_count=0 then
  raise exception 'No Mary Jane participant was found in this Supabase project. Check that the project reference is pbbsaquwumxyrhqhnobv.';
 end if;
 if v_participant_count>1 then
  raise exception 'More than one participant matches Mary Jane. No records were removed.';
 end if;

 select count(*) into v_sifrol_count
 from public.medications
 where regexp_replace(lower(coalesce(medication_name,'')),'[^a-z0-9]+','','g') like 'sifrol%';

 select id,participant_id into v_sifrol_id,v_sifrol_participant
 from public.medications
 where regexp_replace(lower(coalesce(medication_name,'')),'[^a-z0-9]+','','g') like 'sifrol%'
 order by created_at,id
 limit 1;

 if v_sifrol_count>1 then
  raise exception 'More than one medication matches Sifrol. No records were removed.';
 end if;
 if v_sifrol_count=1 and v_sifrol_participant<>v_participant_id then
  raise exception 'The matching Sifrol medication is not linked to the Mary Jane demo participant. No records were removed.';
 end if;

 select string_agg(full_name||' <'||coalesce(email,'no email')||'>',', ')
 into v_linked_profiles
 from public.profiles
 where participant_id=v_participant_id;
 if v_linked_profiles is not null then
  raise exception 'Mary Jane is linked to portal account(s): %. Remove those fake accounts through People & access management first.',v_linked_profiles;
 end if;

 select count(*) into v_document_count
 from public.compliance_documents
 where scope='Participant' and subject_id=v_participant_id;
 if v_document_count>0 then
  raise exception 'Mary Jane has % participant document(s). Delete those fake documents through Florence first so private Storage is cleaned safely.',v_document_count;
 end if;

 select array_agg(id) into v_shift_ids
 from public.shifts where participant_id=v_participant_id;

 if to_regclass('public.incidents') is not null then
  select array_agg(id) into v_incident_ids
  from public.incidents where participant_id=v_participant_id;
 end if;

 if to_regclass('public.complaints') is not null then
  select array_agg(id) into v_complaint_ids
  from public.complaints where participant_id=v_participant_id;
 end if;

 if to_regclass('public.retention_register') is not null then
  delete from public.retention_register
  where organisation_id=v_participant_org
    and (
     (table_name='incidents' and record_id=any(coalesce(v_incident_ids,array[]::uuid[])))
     or (table_name='complaints' and record_id=any(coalesce(v_complaint_ids,array[]::uuid[])))
    );
 end if;

 delete from public.portal_messages
 where thread_id in(select id from public.portal_threads where participant_id=v_participant_id);
 delete from public.portal_threads where participant_id=v_participant_id;
 delete from public.notifications
 where related_record_id=any(coalesce(v_shift_ids,array[]::uuid[]));

 if to_regclass('public.timesheets') is not null then
  delete from public.timesheets
  where shift_id=any(coalesce(v_shift_ids,array[]::uuid[]));
 end if;

 if to_regclass('public.travel_expenses') is not null then
  delete from public.travel_expenses
  where participant_id=v_participant_id
     or shift_id=any(coalesce(v_shift_ids,array[]::uuid[]));
 end if;

 if to_regclass('public.controlled_drug_register') is not null then
  delete from public.controlled_drug_register where participant_id=v_participant_id;
 end if;

 if to_regclass('public.medication_incidents') is not null then
  delete from public.medication_incidents where participant_id=v_participant_id;
 end if;

 delete from public.mar_entries where participant_id=v_participant_id;
 delete from public.client_timeline where participant_id=v_participant_id;
 delete from public.progress_notes where participant_id=v_participant_id;

 if to_regclass('public.sil_records') is not null then
  delete from public.sil_records where participant_id=v_participant_id;
 end if;

 delete from public.shifts where participant_id=v_participant_id;

 if to_regclass('public.participant_access_assignments') is not null then
  delete from public.participant_access_assignments where participant_id=v_participant_id;
 end if;

 if to_regclass('public.emergency_plans') is not null then
  delete from public.emergency_plans where participant_id=v_participant_id;
 end if;

 if to_regclass('public.participant_goals') is not null then
  delete from public.participant_goals where participant_id=v_participant_id;
 end if;

 if to_regclass('public.funding_plans') is not null then
  delete from public.funding_plans where participant_id=v_participant_id;
 end if;

 if to_regclass('public.incidents') is not null then
  delete from public.incidents where participant_id=v_participant_id;
 end if;

 if to_regclass('public.complaints') is not null then
  delete from public.complaints where participant_id=v_participant_id;
 end if;

 delete from public.invoices where participant_id=v_participant_id;
 delete from public.medications where participant_id=v_participant_id;
 delete from public.participants where id=v_participant_id;

 if exists(
  select 1 from public.participants
  where regexp_replace(lower(coalesce(full_name,'')),'[^a-z0-9]+','','g')='maryjane'
     or regexp_replace(lower(coalesce(preferred_name,'')),'[^a-z0-9]+','','g')='maryjane'
 ) then
  raise exception 'Mary Jane remains after cleanup; the transaction has been rolled back';
 end if;

 if exists(
  select 1 from public.medications
  where regexp_replace(lower(coalesce(medication_name,'')),'[^a-z0-9]+','','g') like 'sifrol%'
 ) then
  raise exception 'Sifrol remains after cleanup; the transaction has been rolled back';
 end if;

 insert into public.audit_events(
  organisation_id,actor_id,table_name,record_id,action,after_data
 ) values(
  v_participant_org,auth.uid(),'preproduction_test_data',v_participant_id::text,'DELETE',
  jsonb_build_object(
   'event','mary_jane_sifrol_hotfix_cleanup',
   'participant_id',v_participant_id,
   'sifrol_id',v_sifrol_id,
   'completed_at',now()
  )
 );
end;
$cleanup$;

commit;

select
 case
  when exists(
   select 1 from public.participants
   where regexp_replace(lower(coalesce(full_name,'')),'[^a-z0-9]+','','g')='maryjane'
      or regexp_replace(lower(coalesce(preferred_name,'')),'[^a-z0-9]+','','g')='maryjane'
  ) then 'FAIL'
  when exists(
   select 1 from public.medications
   where regexp_replace(lower(coalesce(medication_name,'')),'[^a-z0-9]+','','g') like 'sifrol%'
  ) then 'FAIL'
  else 'REMOVED'
 end as demo_cleanup,
 (select count(*) from public.participants
  where regexp_replace(lower(coalesce(full_name,'')),'[^a-z0-9]+','','g')='maryjane'
     or regexp_replace(lower(coalesce(preferred_name,'')),'[^a-z0-9]+','','g')='maryjane') as mary_jane_remaining,
 (select count(*) from public.medications
  where regexp_replace(lower(coalesce(medication_name,'')),'[^a-z0-9]+','','g') like 'sifrol%') as sifrol_remaining;
