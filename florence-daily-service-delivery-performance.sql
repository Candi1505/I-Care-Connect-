-- Florence SIL least-privilege and query-performance follow-up — 5 August 2026

begin;

create index if not exists sil_records_created_by_idx
 on public.sil_records(created_by);
create index if not exists sil_records_updated_by_idx
 on public.sil_records(updated_by)
 where updated_by is not null;
create index if not exists sil_records_archived_by_idx
 on public.sil_records(archived_by)
 where archived_by is not null;
create index if not exists sil_provider_profiles_updated_by_idx
 on public.sil_provider_profiles(updated_by);

drop policy if exists sil_records_supervisor_all on public.sil_records;
drop policy if exists sil_records_staff_select on public.sil_records;
drop policy if exists sil_records_staff_insert on public.sil_records;
drop policy if exists sil_records_select on public.sil_records;
drop policy if exists sil_records_insert on public.sil_records;
drop policy if exists sil_records_update on public.sil_records;

create policy sil_records_select on public.sil_records
 for select to authenticated
 using(
  organisation_id=(select public.current_org_id())
  and (
   (select public.is_supervisor())
   or (
    (select public.current_role())='staff'
    and archived_at is null
    and (
     (participant_id is not null and public.can_access_participant(participant_id))
     or staff_id=(select auth.uid())
     or created_by=(select auth.uid())
    )
   )
  )
 );

create policy sil_records_insert on public.sil_records
 for insert to authenticated
 with check(
  organisation_id=(select public.current_org_id())
  and (
   (select public.is_supervisor())
   or (
    (select public.current_role())='staff'
    and created_by=(select auth.uid())
    and record_type in('visitor','choice','handover')
    and participant_id is not null
    and public.can_access_participant(participant_id)
   )
  )
 );

create policy sil_records_update on public.sil_records
 for update to authenticated
 using(
  (select public.is_supervisor())
  and organisation_id=(select public.current_org_id())
 )
 with check(
  (select public.is_supervisor())
  and organisation_id=(select public.current_org_id())
 );

drop policy if exists sil_records_mfa_required on public.sil_records;
create policy sil_records_mfa_required on public.sil_records
 as restrictive for all to authenticated
 using(coalesce(((select auth.jwt())->>'aal'),'aal1')='aal2')
 with check(coalesce(((select auth.jwt())->>'aal'),'aal1')='aal2');

drop policy if exists sil_provider_profiles_select on public.sil_provider_profiles;
drop policy if exists sil_provider_profiles_supervisor_all on public.sil_provider_profiles;
drop policy if exists sil_provider_profiles_insert on public.sil_provider_profiles;
drop policy if exists sil_provider_profiles_update on public.sil_provider_profiles;

create policy sil_provider_profiles_select on public.sil_provider_profiles
 for select to authenticated
 using(
  organisation_id=(select public.current_org_id())
  and (select public.current_role()) in('staff','supervisor')
 );

create policy sil_provider_profiles_insert on public.sil_provider_profiles
 for insert to authenticated
 with check(
  (select public.is_supervisor())
  and organisation_id=(select public.current_org_id())
 );

create policy sil_provider_profiles_update on public.sil_provider_profiles
 for update to authenticated
 using(
  (select public.is_supervisor())
  and organisation_id=(select public.current_org_id())
 )
 with check(
  (select public.is_supervisor())
  and organisation_id=(select public.current_org_id())
 );

drop policy if exists sil_provider_profiles_mfa_required on public.sil_provider_profiles;
create policy sil_provider_profiles_mfa_required on public.sil_provider_profiles
 as restrictive for all to authenticated
 using(coalesce(((select auth.jwt())->>'aal'),'aal1')='aal2')
 with check(coalesce(((select auth.jwt())->>'aal'),'aal1')='aal2');

notify pgrst,'reload schema';
commit;

select
 case
  when not exists(select 1 from pg_policies where schemaname='public' and tablename='sil_records' and policyname='sil_records_select') then 'FAIL_SELECT_POLICY'
  when to_regclass('public.sil_records_created_by_idx') is null then 'FAIL_FK_INDEX'
  else 'PASS_SIL_POLICY_PERFORMANCE'
 end as result;
