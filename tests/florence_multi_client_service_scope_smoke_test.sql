\set ON_ERROR_STOP on

begin;

do $$
declare
 v_organisation_id uuid;
 v_participant_id uuid;
 v_other_participant_id uuid;
 v_family_id uuid:=gen_random_uuid();
 v_client_id uuid:=gen_random_uuid();
 v_blocked boolean;
begin
 if to_regclass('public.participant_service_scopes') is null then
  raise exception 'participant_service_scopes table is missing';
 end if;
 if not exists(
  select 1 from information_schema.columns
  where table_schema='public' and table_name='participants'
    and column_name='service_scope_confirmed_at'
 ) then raise exception 'participants service-scope confirmation is missing'; end if;
 if not exists(
  select 1 from information_schema.columns
  where table_schema='public' and table_name='invoice_items'
    and column_name='service_type'
 ) then raise exception 'invoice item service type is missing'; end if;
 if not exists(
  select 1 from pg_class
  where oid='public.participant_service_scopes'::regclass and relrowsecurity
 ) then raise exception 'participant service scopes do not have RLS enabled'; end if;
 if to_regprocedure('public.create_participant_with_services(jsonb,text[])') is null
    or to_regprocedure('public.set_participant_service_scopes(uuid,text[])') is null
    or to_regprocedure('public.participant_service_allowed(uuid,text,date)') is null then
  raise exception 'participant service-scope functions are incomplete';
 end if;
 if has_function_privilege('anon','public.create_participant_with_services(jsonb,text[])','execute')
    or has_function_privilege('anon','public.set_participant_service_scopes(uuid,text[])','execute') then
  raise exception 'anonymous role can execute supervisor onboarding functions';
 end if;
 if not has_function_privilege('authenticated','public.create_participant_with_services(jsonb,text[])','execute')
    or not has_function_privilege('authenticated','public.set_participant_service_scopes(uuid,text[])','execute') then
  raise exception 'authenticated role cannot reach MFA-protected onboarding functions';
 end if;

 insert into public.organisations(name)
 values('Florence service-scope smoke '||gen_random_uuid()::text)
 returning id into v_organisation_id;

 insert into public.participants(
  organisation_id,full_name,status,service_scope_confirmed_at
 ) values(
  v_organisation_id,'Service Scope Smoke Participant','Active',now()
 ) returning id into v_participant_id;

 insert into public.participants(
  organisation_id,full_name,status,service_scope_confirmed_at
 ) values(
  v_organisation_id,'Other Service Scope Smoke Participant','Active',now()
 ) returning id into v_other_participant_id;

 insert into public.participant_service_scopes(
  organisation_id,participant_id,service_type,starts_on
 ) values(
  v_organisation_id,v_participant_id,'Domestic assistance',current_date
 );

 if not public.participant_service_allowed(v_participant_id,'Domestic assistance',current_date) then
  raise exception 'Domestic assistance should be allowed';
 end if;
 if public.participant_service_allowed(v_participant_id,'Personal care',current_date) then
  raise exception 'Personal care should be blocked';
 end if;

 insert into public.shifts(
  organisation_id,participant_id,starts_at,ends_at,shift_type,status,response
 ) values(
  v_organisation_id,v_participant_id,now()+interval '1 day',now()+interval '3 hours 1 day',
  'Domestic assistance','Draft','Not sent'
 );

 v_blocked:=false;
 begin
  insert into public.shifts(
   organisation_id,participant_id,starts_at,ends_at,shift_type,status,response
  ) values(
   v_organisation_id,v_participant_id,now()+interval '2 days',now()+interval '2 days 3 hours',
   'Personal care','Draft','Not sent'
  );
 exception when others then v_blocked:=true;
 end;
 if not v_blocked then raise exception 'Personal care shift was not blocked'; end if;

 v_blocked:=false;
 begin
  insert into public.medications(
   organisation_id,participant_id,medication_name,dose,route,medication_type,active
  ) values(
   v_organisation_id,v_participant_id,'Scope smoke medicine','1','Oral','Regular',true
  );
 exception when others then v_blocked:=true;
 end;
 if not v_blocked then raise exception 'Medication record was not blocked'; end if;

 insert into auth.users(id,email,raw_user_meta_data) values
  (v_family_id,'family-'||v_family_id::text||'@example.test',jsonb_build_object('organisation_id',v_organisation_id,'full_name','Smoke Family')),
  (v_client_id,'client-'||v_client_id::text||'@example.test',jsonb_build_object('organisation_id',v_organisation_id,'full_name','Smoke Participant'));
 update public.profiles
 set participant_id=v_participant_id,
     role=case when id=v_family_id then 'family'::public.app_role else 'client'::public.app_role end,
     active=true
 where id in(v_family_id,v_client_id);

 perform set_config('florence.test_family',v_family_id::text,true);
 perform set_config('florence.test_client',v_client_id::text,true);
end;
$$;

-- A participant and their family representative can have separate accounts
-- linked to the same participant, while both remain isolated from other clients.
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('florence.test_family'),true);
select set_config(
 'request.jwt.claims',
 format('{"sub":"%s","aal":"aal2","role":"authenticated"}',current_setting('florence.test_family')),
 true
);
do $$
declare v_count integer;
begin
 select count(*) into v_count from public.participants;
 if v_count<>1 then raise exception 'Family portal was not isolated to one linked participant'; end if;
 select count(*) into v_count from public.participant_service_scopes;
 if v_count<>1 then raise exception 'Family portal could not read the linked domestic service scope'; end if;
end;
$$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('florence.test_client'),true);
select set_config(
 'request.jwt.claims',
 format('{"sub":"%s","aal":"aal2","role":"authenticated"}',current_setting('florence.test_client')),
 true
);
do $$
declare v_count integer;
begin
 select count(*) into v_count from public.participants;
 if v_count<>1 then raise exception 'Participant portal was not isolated to one linked participant'; end if;
 select count(*) into v_count from public.participant_service_scopes;
 if v_count<>1 then raise exception 'Participant portal could not read the linked domestic service scope'; end if;
end;
$$;
reset role;

rollback;

select 'MULTI_CLIENT_SERVICE_SCOPE_SMOKE_PASS' as result;
