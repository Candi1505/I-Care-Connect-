-- Florence multi-client onboarding and participant service-scope controls.
-- Safe to apply more than once. Existing participants remain in legacy review
-- mode until a supervisor confirms their approved services in Florence.

begin;

alter table public.participants
 add column if not exists service_scope_confirmed_at timestamptz;

create table if not exists public.participant_service_scopes (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references public.organisations(id) on delete cascade,
 participant_id uuid not null references public.participants(id) on delete cascade,
 service_type text not null,
 active boolean not null default true,
 starts_on date,
 ends_on date,
 confirmed_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint participant_service_scopes_service_type_check check (
  service_type in (
   'Domestic assistance',
   'Personal care',
   'Community access',
   'Social support',
   'Sleepover',
   'Transport',
   '24-hour support',
   'Medication support'
  )
 ),
 constraint participant_service_scopes_dates_check check (
  ends_on is null or starts_on is null or ends_on>=starts_on
 ),
 constraint participant_service_scopes_participant_service_key unique(participant_id,service_type)
);

create index if not exists participant_service_scopes_org_idx
 on public.participant_service_scopes(organisation_id);
create index if not exists participant_service_scopes_participant_active_idx
 on public.participant_service_scopes(participant_id,active);
create index if not exists participant_service_scopes_confirmed_by_idx
 on public.participant_service_scopes(confirmed_by);

create or replace function public.validate_participant_service_scope_row()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
 v_organisation_id uuid;
begin
 select organisation_id
 into v_organisation_id
 from public.participants
 where id=new.participant_id;

 if v_organisation_id is null then
  raise exception 'Participant service scope requires a valid participant';
 end if;

 if new.organisation_id<>v_organisation_id then
  raise exception 'Participant service scope must use the participant organisation';
 end if;

 new.updated_at:=now();
 return new;
end;
$$;

revoke all on function public.validate_participant_service_scope_row() from public,anon,authenticated;
grant execute on function public.validate_participant_service_scope_row() to service_role;

drop trigger if exists participant_service_scopes_validate on public.participant_service_scopes;
create trigger participant_service_scopes_validate
before insert or update on public.participant_service_scopes
for each row execute function public.validate_participant_service_scope_row();

drop trigger if exists participant_service_scopes_audit on public.participant_service_scopes;
create trigger participant_service_scopes_audit
after insert or update or delete on public.participant_service_scopes
for each row execute function public.audit_row_change();

alter table public.participant_service_scopes enable row level security;

drop policy if exists participant_service_scopes_select on public.participant_service_scopes;
create policy participant_service_scopes_select
on public.participant_service_scopes
for select
to authenticated
using (
 organisation_id=public.current_org_id()
 and public.can_access_participant(participant_id)
);

drop policy if exists participant_service_scopes_supervisor_all on public.participant_service_scopes;
drop policy if exists participant_service_scopes_supervisor_insert on public.participant_service_scopes;
create policy participant_service_scopes_supervisor_insert
on public.participant_service_scopes
for insert
to authenticated
with check (
 coalesce((select auth.jwt())->>'aal','aal1')='aal2'
 and (select public.is_supervisor())
 and organisation_id=(select public.current_org_id())
);

drop policy if exists participant_service_scopes_supervisor_update on public.participant_service_scopes;
create policy participant_service_scopes_supervisor_update
on public.participant_service_scopes
for update
to authenticated
using (
 coalesce((select auth.jwt())->>'aal','aal1')='aal2'
 and (select public.is_supervisor())
 and organisation_id=(select public.current_org_id())
)
with check (
 coalesce((select auth.jwt())->>'aal','aal1')='aal2'
 and (select public.is_supervisor())
 and organisation_id=(select public.current_org_id())
);

drop policy if exists participant_service_scopes_supervisor_delete on public.participant_service_scopes;
create policy participant_service_scopes_supervisor_delete
on public.participant_service_scopes
for delete
to authenticated
using (
 coalesce((select auth.jwt())->>'aal','aal1')='aal2'
 and (select public.is_supervisor())
 and organisation_id=(select public.current_org_id())
);

revoke all on table public.participant_service_scopes from public,anon;
grant select,insert,update,delete on table public.participant_service_scopes to authenticated;
grant all on table public.participant_service_scopes to service_role;

create or replace function public.participant_service_allowed(
 p_participant_id uuid,
 p_service_type text,
 p_service_date date default current_date
)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
 select case
  when participant.service_scope_confirmed_at is null then true
  else exists(
   select 1
   from public.participant_service_scopes scope_record
   where scope_record.participant_id=participant.id
     and scope_record.organisation_id=participant.organisation_id
     and scope_record.service_type=p_service_type
     and scope_record.active
     and (scope_record.starts_on is null or scope_record.starts_on<=coalesce(p_service_date,current_date))
     and (scope_record.ends_on is null or scope_record.ends_on>=coalesce(p_service_date,current_date))
  )
 end
 from public.participants participant
 where participant.id=p_participant_id
$$;

revoke all on function public.participant_service_allowed(uuid,text,date) from public,anon,authenticated;
grant execute on function public.participant_service_allowed(uuid,text,date) to service_role;

create or replace function public.set_participant_service_scopes(
 p_participant_id uuid,
 p_service_types text[]
)
returns void
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
 v_profile public.profiles%rowtype;
 v_service_type text;
 v_allowed constant text[]:=array[
  'Domestic assistance','Personal care','Community access','Social support',
  'Sleepover','Transport','24-hour support','Medication support'
 ];
begin
 perform public.require_verified_mfa();

 select * into v_profile
 from public.profiles
 where id=auth.uid() and active=true;

 if v_profile.id is null or v_profile.role<>'supervisor' then
  raise exception 'Only an active supervisor can confirm participant services';
 end if;

 if not exists(
  select 1 from public.participants
  where id=p_participant_id and organisation_id=v_profile.organisation_id
 ) then
  raise exception 'Participant not found in your organisation';
 end if;

 if coalesce(cardinality(p_service_types),0)=0 then
  raise exception 'Choose at least one approved service';
 end if;

 foreach v_service_type in array p_service_types loop
  if v_service_type is null or not (v_service_type=any(v_allowed)) then
   raise exception 'Unsupported participant service: %',coalesce(v_service_type,'');
  end if;
 end loop;

 delete from public.participant_service_scopes
 where participant_id=p_participant_id
   and organisation_id=v_profile.organisation_id;

 insert into public.participant_service_scopes(
  organisation_id,participant_id,service_type,active,starts_on,confirmed_by
 )
 select v_profile.organisation_id,p_participant_id,service_type,true,current_date,v_profile.id
 from unnest(p_service_types) service_type
 group by service_type;

 update public.participants
 set service_scope_confirmed_at=now()
 where id=p_participant_id
   and organisation_id=v_profile.organisation_id;
end;
$$;

revoke all on function public.set_participant_service_scopes(uuid,text[]) from public,anon;
grant execute on function public.set_participant_service_scopes(uuid,text[]) to authenticated,service_role;

create or replace function public.create_participant_with_services(
 p_participant jsonb,
 p_service_types text[]
)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
 v_profile public.profiles%rowtype;
 v_participant_id uuid;
 v_service_type text;
 v_allowed constant text[]:=array[
  'Domestic assistance','Personal care','Community access','Social support',
  'Sleepover','Transport','24-hour support','Medication support'
 ];
begin
 perform public.require_verified_mfa();

 select * into v_profile
 from public.profiles
 where id=auth.uid() and active=true;

 if v_profile.id is null or v_profile.role<>'supervisor' then
  raise exception 'Only an active supervisor can onboard a participant';
 end if;

 if nullif(btrim(coalesce(p_participant->>'full_name','')),'') is null then
  raise exception 'Full legal name is required';
 end if;

 if coalesce(cardinality(p_service_types),0)=0 then
  raise exception 'Choose at least one approved service';
 end if;

 foreach v_service_type in array p_service_types loop
  if v_service_type is null or not (v_service_type=any(v_allowed)) then
   raise exception 'Unsupported participant service: %',coalesce(v_service_type,'');
  end if;
 end loop;

 insert into public.participants(
  organisation_id,full_name,preferred_name,date_of_birth,ndis_number,address,phone,
  emergency_contact,guardian_nominee,gp,pharmacy,communication_needs,diagnoses,
  allergies,goals,preferences,risks_and_safeguards,funding_start,funding_end,status
 ) values (
  v_profile.organisation_id,
  btrim(p_participant->>'full_name'),
  nullif(btrim(p_participant->>'preferred_name'),''),
  nullif(p_participant->>'date_of_birth','')::date,
  nullif(btrim(p_participant->>'ndis_number'),''),
  nullif(btrim(p_participant->>'address'),''),
  nullif(btrim(p_participant->>'phone'),''),
  nullif(btrim(p_participant->>'emergency_contact'),''),
  nullif(btrim(p_participant->>'guardian_nominee'),''),
  nullif(btrim(p_participant->>'gp'),''),
  nullif(btrim(p_participant->>'pharmacy'),''),
  nullif(btrim(p_participant->>'communication_needs'),''),
  nullif(btrim(p_participant->>'diagnoses'),''),
  nullif(btrim(p_participant->>'allergies'),''),
  nullif(btrim(p_participant->>'goals'),''),
  nullif(btrim(p_participant->>'preferences'),''),
  nullif(btrim(p_participant->>'risks_and_safeguards'),''),
  nullif(p_participant->>'funding_start','')::date,
  nullif(p_participant->>'funding_end','')::date,
  'Active'
 ) returning id into v_participant_id;

 insert into public.participant_service_scopes(
  organisation_id,participant_id,service_type,active,starts_on,confirmed_by
 )
 select v_profile.organisation_id,v_participant_id,service_type,true,current_date,v_profile.id
 from unnest(p_service_types) service_type
 group by service_type;

 update public.participants
 set service_scope_confirmed_at=now()
 where id=v_participant_id;

 return v_participant_id;
end;
$$;

revoke all on function public.create_participant_with_services(jsonb,text[]) from public,anon;
grant execute on function public.create_participant_with_services(jsonb,text[]) to authenticated,service_role;

do $$
begin
 -- The core Florence schema can be installed without the optional invoicing
 -- workspace. Add invoice enforcement whenever that later module is present.
 if to_regclass('public.invoice_items') is not null then
  execute 'alter table public.invoice_items add column if not exists service_type text';
  if not exists(
   select 1 from pg_constraint
   where conname='invoice_items_service_type_check'
     and conrelid=to_regclass('public.invoice_items')
  ) then
   execute $sql$
    alter table public.invoice_items
     add constraint invoice_items_service_type_check check (
      service_type is null or service_type in (
       'Domestic assistance','Personal care','Community access','Social support',
       'Sleepover','Transport','24-hour support','Medication support'
      )
     )
   $sql$;
  end if;
 end if;
end;
$$;

create or replace function public.enforce_participant_service_scope()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
 v_participant_id uuid;
 v_service_type text;
 v_service_date date:=current_date;
 v_invoice_participant_id uuid;
 v_shift_participant_id uuid;
 v_shift_type text;
begin
 if tg_table_name='shifts' then
  v_participant_id:=new.participant_id;
  v_service_type:=new.shift_type::text;
  v_service_date:=(new.starts_at at time zone 'Australia/Brisbane')::date;
 elsif tg_table_name='medications' then
  v_participant_id:=new.participant_id;
  v_service_type:='Medication support';
 elsif tg_table_name='progress_notes' then
  v_participant_id:=new.participant_id;
  v_service_type:=case btrim(new.category)
   when 'Domestic assistance' then 'Domestic assistance'
   when 'Personal care' then 'Personal care'
   when 'Community access' then 'Community access'
   when 'Health' then 'Medication support'
   else null
  end;
 elsif tg_table_name='invoice_items' then
  select participant_id into v_invoice_participant_id
  from public.invoices where id=new.invoice_id;
  if v_invoice_participant_id is null then
   raise exception 'Invoice item requires an invoice with a participant';
  end if;
  v_participant_id:=v_invoice_participant_id;
  v_service_type:=new.service_type;
  v_service_date:=new.service_date;

  if new.shift_id is not null then
   select participant_id,shift_type::text
   into v_shift_participant_id,v_shift_type
   from public.shifts where id=new.shift_id;
   if v_shift_participant_id is distinct from v_participant_id then
    raise exception 'Invoice shift must belong to the invoice participant';
   end if;
   if v_service_type is distinct from v_shift_type then
    raise exception 'Invoice service must match the linked roster shift';
   end if;
  end if;
 end if;

 if v_participant_id is null then
  return new;
 end if;

 if v_service_type is null then
  if exists(
   select 1 from public.participants
   where id=v_participant_id and service_scope_confirmed_at is not null
  ) and tg_table_name='invoice_items' then
   raise exception 'Choose an approved service for every invoice line';
  end if;
  return new;
 end if;

 if not coalesce(public.participant_service_allowed(
  v_participant_id,v_service_type,v_service_date
 ),false) then
  raise exception '% is not in this participant''s approved service scope',v_service_type;
 end if;

 return new;
end;
$$;

revoke all on function public.enforce_participant_service_scope() from public,anon,authenticated;
grant execute on function public.enforce_participant_service_scope() to service_role;

drop trigger if exists shifts_service_scope_enforcement on public.shifts;
create trigger shifts_service_scope_enforcement
before insert or update of participant_id,shift_type,starts_at on public.shifts
for each row execute function public.enforce_participant_service_scope();

drop trigger if exists medications_service_scope_enforcement on public.medications;
create trigger medications_service_scope_enforcement
before insert or update of participant_id on public.medications
for each row execute function public.enforce_participant_service_scope();

drop trigger if exists progress_notes_service_scope_enforcement on public.progress_notes;
create trigger progress_notes_service_scope_enforcement
before insert or update of participant_id,category on public.progress_notes
for each row execute function public.enforce_participant_service_scope();

do $$
begin
 if to_regclass('public.invoice_items') is not null then
  execute 'drop trigger if exists invoice_items_service_scope_enforcement on public.invoice_items';
  execute $sql$
   create trigger invoice_items_service_scope_enforcement
   before insert or update of invoice_id,shift_id,service_type,service_date on public.invoice_items
   for each row execute function public.enforce_participant_service_scope()
  $sql$;
  execute $sql$
   comment on column public.invoice_items.service_type is
    'Florence service category used to validate the invoice line against the participant approved scope.'
  $sql$;
 end if;
end;
$$;

comment on table public.participant_service_scopes is
 'Supervisor-confirmed services that may be rostered, documented and invoiced for each participant.';
comment on column public.participants.service_scope_confirmed_at is
 'When set, Florence enforces participant_service_scopes. Null marks an existing participant awaiting service-scope review.';
commit;
