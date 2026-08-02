-- Florence Schedule 8 dual-signoff and participant timeline upgrade — 2 August 2026
--
-- Purpose:
--   * requires the administering worker's PIN and a different authorised worker's PIN
--     when a Schedule 8 medication is recorded as administered;
--   * stores the two identities and verification evidence on the MAR and S8 register;
--   * moves all future manual Schedule 8 stock transactions behind a dual-PIN RPC;
--   * automatically mirrors MAR entries and progress notes into the participant timeline;
--   * backfills existing MAR entries and progress notes that are not already linked.
--
-- Run once in the live I-Care Connect Supabase project pbbsaquwumxyrhqhnobv.
-- This migration is additive, non-destructive and safe to re-run.

begin;

do $requirements$
declare
 v_pgcrypto_schema text;
begin
 if to_regclass('public.profiles') is null
    or to_regclass('public.participants') is null
    or to_regclass('public.medications') is null
    or to_regclass('public.mar_entries') is null
    or to_regclass('public.progress_notes') is null
    or to_regclass('public.client_timeline') is null
    or to_regclass('public.controlled_drug_register') is null
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
 if to_regprocedure(format('%I.crypt(text,text)',v_pgcrypto_schema)) is null then
  raise exception 'pgcrypto is installed, but crypt(text,text) is unavailable.';
 end if;
end;
$requirements$;

-- -------------------------------------------------------------------------
-- 1. MAR and controlled-drug evidence fields
-- -------------------------------------------------------------------------

alter table public.mar_entries
 add column if not exists dual_signoff_required boolean not null default false;
alter table public.mar_entries
 add column if not exists witnessed_by uuid references public.profiles(id) on delete restrict;
alter table public.mar_entries
 add column if not exists witness_pin_verified boolean not null default false;
alter table public.mar_entries
 add column if not exists witnessed_at timestamptz;
alter table public.mar_entries
 add column if not exists s8_quantity numeric(10,3);
alter table public.mar_entries
 add column if not exists s8_balance numeric(10,3);

do $mar_constraints$
begin
 if not exists(
  select 1 from pg_constraint
  where conrelid='public.mar_entries'::regclass
    and conname='mar_dual_signoff_consistent'
 ) then
  alter table public.mar_entries
   add constraint mar_dual_signoff_consistent check(
    not dual_signoff_required
    or (
     witnessed_by is not null
     and witnessed_by<>staff_id
     and witness_pin_verified
     and witnessed_at is not null
    )
   ) not valid;
 end if;
 if not exists(
  select 1 from pg_constraint
  where conrelid='public.mar_entries'::regclass
    and conname='mar_s8_quantity_balance_nonnegative'
 ) then
  alter table public.mar_entries
   add constraint mar_s8_quantity_balance_nonnegative check(
    (s8_quantity is null or s8_quantity>0)
    and (s8_balance is null or s8_balance>=0)
   ) not valid;
 end if;
end;
$mar_constraints$;

alter table public.controlled_drug_register
 add column if not exists mar_entry_id uuid references public.mar_entries(id) on delete restrict;
alter table public.controlled_drug_register
 add column if not exists recorded_pin_verified boolean not null default false;
alter table public.controlled_drug_register
 add column if not exists witness_pin_verified boolean not null default false;
alter table public.controlled_drug_register
 add column if not exists witnessed_at timestamptz;

create unique index if not exists controlled_drug_register_mar_unique
 on public.controlled_drug_register(mar_entry_id)
 where mar_entry_id is not null;

do $controlled_constraints$
begin
 if not exists(
  select 1 from pg_constraint
  where conrelid='public.controlled_drug_register'::regclass
    and conname='controlled_drug_future_dual_signoff'
 ) then
  alter table public.controlled_drug_register
   add constraint controlled_drug_future_dual_signoff check(
    recorded_by is not null
    and witnessed_by is not null
    and witnessed_by<>recorded_by
    and recorded_pin_verified
    and witness_pin_verified
    and witnessed_at is not null
   ) not valid;
 end if;
end;
$controlled_constraints$;

-- -------------------------------------------------------------------------
-- 2. Internal witness access helper
-- -------------------------------------------------------------------------

create or replace function public.staff_may_witness_participant(
 p_staff_id uuid,
 p_participant_id uuid,
 p_organisation_id uuid
) returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
 select exists(
  select 1
  from public.profiles witness
  join public.participants participant
    on participant.id=p_participant_id
   and participant.organisation_id=p_organisation_id
  where witness.id=p_staff_id
    and witness.organisation_id=p_organisation_id
    and witness.active
    and witness.role in('staff','supervisor')
    and (
     witness.role='supervisor'
     or exists(
      select 1
      from public.participant_access_assignments assignment
      where assignment.organisation_id=p_organisation_id
        and assignment.participant_id=p_participant_id
        and assignment.staff_id=p_staff_id
        and assignment.active
        and assignment.revoked_at is null
        and assignment.starts_at<=now()
        and (assignment.ends_at is null or assignment.ends_at>now())
     )
     or exists(
      select 1
      from public.shifts shift_record
      where shift_record.organisation_id=p_organisation_id
        and shift_record.participant_id=p_participant_id
        and shift_record.assigned_staff_id=p_staff_id
        and shift_record.status in('Published','Completed')
        and shift_record.response<>'Declined'
        and now() between shift_record.starts_at-interval '12 hours'
                         and shift_record.ends_at+interval '12 hours'
     )
    )
 );
$$;
revoke all on function public.staff_may_witness_participant(uuid,uuid,uuid) from public,authenticated;

-- -------------------------------------------------------------------------
-- 3. Controlled medication administration RPC
-- -------------------------------------------------------------------------

-- Remove the earlier overload so Schedule 8 administrations cannot bypass the
-- witness fields by calling the old four-argument function directly.
drop function if exists public.record_medication_administration(uuid,text,public.mar_status,text);
drop function if exists public.record_medication_administration(uuid,text,public.mar_status);
drop function if exists public.record_medication_administration(uuid,text,text);

create function public.record_medication_administration(
 p_medication_id uuid,
 p_pin text,
 p_status public.mar_status default 'Administered',
 p_notes text default null,
 p_witness_id uuid default null,
 p_witness_pin text default null,
 p_s8_quantity numeric default null,
 p_s8_balance numeric default null
) returns uuid
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
 v_profile public.profiles%rowtype;
 v_witness public.profiles%rowtype;
 v_medication public.medications%rowtype;
 v_entry_id uuid;
 v_is_schedule_8 boolean;
 v_dual_required boolean;
 v_now timestamptz:=clock_timestamp();
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

 v_is_schedule_8:=regexp_replace(lower(coalesce(v_medication.medication_type,'')),'[^a-z0-9]+','','g') in('schedule8','s8');
 v_dual_required:=v_is_schedule_8 and p_status='Administered'::public.mar_status;

 if v_dual_required then
  if p_witness_id is null then
   raise exception 'Schedule 8 administration requires a second worker';
  end if;
  if p_witness_id=v_profile.id then
   raise exception 'The Schedule 8 witness must be a different worker';
  end if;
  if p_witness_pin is null or p_witness_pin !~ '^[0-9]{6}$' then
   raise exception 'The second worker must enter their own six-digit PIN';
  end if;

  select * into v_witness
  from public.profiles
  where id=p_witness_id
    and organisation_id=v_profile.organisation_id
    and active=true
    and role in('staff','supervisor');

  if v_witness.id is null then
   raise exception 'The selected Schedule 8 witness is not an active Florence worker';
  end if;
  if not public.staff_may_witness_participant(
   v_witness.id,v_medication.participant_id,v_profile.organisation_id
  ) then
   raise exception 'The selected worker is not authorised to witness medication for this participant';
  end if;
  if v_witness.medication_pin_hash is null then
   raise exception 'The selected witness must create their own Florence signing PIN first';
  end if;
  if crypt(p_witness_pin,v_witness.medication_pin_hash)<>v_witness.medication_pin_hash then
   raise exception 'Incorrect witness PIN';
  end if;
  if p_s8_quantity is null or p_s8_quantity<=0 then
   raise exception 'Enter the Schedule 8 quantity removed from stock';
  end if;
  if p_s8_balance is null or p_s8_balance<0 then
   raise exception 'Enter the Schedule 8 balance remaining after administration';
  end if;
 else
  p_witness_id:=null;
  p_witness_pin:=null;
  p_s8_quantity:=null;
  p_s8_balance:=null;
 end if;

 insert into public.mar_entries(
  organisation_id,medication_id,participant_id,staff_id,status,pin_verified,notes,
  dual_signoff_required,witnessed_by,witness_pin_verified,witnessed_at,
  s8_quantity,s8_balance
 ) values(
  v_profile.organisation_id,v_medication.id,v_medication.participant_id,
  v_profile.id,p_status,true,nullif(btrim(coalesce(p_notes,'')),''),
  v_dual_required,p_witness_id,v_dual_required,
  case when v_dual_required then v_now else null end,
  p_s8_quantity,p_s8_balance
 ) returning id into v_entry_id;

 if v_dual_required then
  insert into public.controlled_drug_register(
   organisation_id,participant_id,medication_id,mar_entry_id,
   transaction_at,transaction_type,quantity,balance,reason,
   recorded_by,witnessed_by,recorded_pin_verified,witness_pin_verified,witnessed_at
  ) values(
   v_profile.organisation_id,v_medication.participant_id,v_medication.id,v_entry_id,
   v_now,'Administered',p_s8_quantity,p_s8_balance,
   nullif(btrim(coalesce(p_notes,'')),''),
   v_profile.id,p_witness_id,true,true,v_now
  );
 end if;

 return v_entry_id;
end;
$$;
revoke all on function public.record_medication_administration(uuid,text,public.mar_status,text,uuid,text,numeric,numeric) from public;
grant execute on function public.record_medication_administration(uuid,text,public.mar_status,text,uuid,text,numeric,numeric) to authenticated;

-- -------------------------------------------------------------------------
-- 4. Dual-PIN manual Schedule 8 stock transaction RPC
-- -------------------------------------------------------------------------

create or replace function public.record_controlled_drug_transaction(
 p_participant_id uuid,
 p_medication_id uuid,
 p_transaction_type text,
 p_quantity numeric,
 p_balance numeric,
 p_reason text,
 p_pin text,
 p_witness_id uuid,
 p_witness_pin text
) returns uuid
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
 v_profile public.profiles%rowtype;
 v_witness public.profiles%rowtype;
 v_medication public.medications%rowtype;
 v_id uuid;
 v_now timestamptz:=clock_timestamp();
begin
 perform public.require_verified_mfa();

 select * into v_profile
 from public.profiles
 where id=auth.uid() and active=true and role in('staff','supervisor');
 if v_profile.id is null then
  raise exception 'Only active staff can record Schedule 8 stock transactions';
 end if;
 if p_pin is null or p_pin !~ '^[0-9]{6}$'
    or v_profile.medication_pin_hash is null
    or crypt(p_pin,v_profile.medication_pin_hash)<>v_profile.medication_pin_hash then
  raise exception 'Incorrect recording worker PIN';
 end if;

 select * into v_medication
 from public.medications
 where id=p_medication_id
   and participant_id=p_participant_id
   and organisation_id=v_profile.organisation_id
   and active=true;
 if v_medication.id is null
    or regexp_replace(lower(coalesce(v_medication.medication_type,'')),'[^a-z0-9]+','','g') not in('schedule8','s8') then
  raise exception 'Select an active Schedule 8 medication for this participant';
 end if;
 if not public.can_access_participant(p_participant_id) then
  raise exception 'You are not authorised for this participant';
 end if;
 if p_transaction_type='Administered' then
  raise exception 'Record Schedule 8 administration through MAR so the dose, dual signatures and timeline stay linked';
 end if;
 if p_transaction_type not in('Received','Destroyed','Adjustment','Count check') then
  raise exception 'Select a valid Schedule 8 stock transaction';
 end if;
 if p_quantity is null or p_quantity<0
    or (p_transaction_type<>'Count check' and p_quantity=0) then
  raise exception 'Enter a valid Schedule 8 quantity';
 end if;
 if p_balance is null or p_balance<0 then
  raise exception 'Enter the Schedule 8 balance after the transaction';
 end if;
 if p_witness_id is null or p_witness_id=v_profile.id then
  raise exception 'A different second worker must witness the Schedule 8 transaction';
 end if;
 if p_witness_pin is null or p_witness_pin !~ '^[0-9]{6}$' then
  raise exception 'The witness must enter their own six-digit PIN';
 end if;

 select * into v_witness
 from public.profiles
 where id=p_witness_id
   and organisation_id=v_profile.organisation_id
   and active=true
   and role in('staff','supervisor');
 if v_witness.id is null then
  raise exception 'The selected witness is not an active Florence worker';
 end if;
 if not public.staff_may_witness_participant(
  v_witness.id,p_participant_id,v_profile.organisation_id
 ) then
  raise exception 'The selected worker is not authorised to witness for this participant';
 end if;
 if v_witness.medication_pin_hash is null
    or crypt(p_witness_pin,v_witness.medication_pin_hash)<>v_witness.medication_pin_hash then
  raise exception 'Incorrect witness PIN';
 end if;

 insert into public.controlled_drug_register(
  organisation_id,participant_id,medication_id,transaction_at,transaction_type,
  quantity,balance,reason,recorded_by,witnessed_by,
  recorded_pin_verified,witness_pin_verified,witnessed_at
 ) values(
  v_profile.organisation_id,p_participant_id,p_medication_id,v_now,p_transaction_type,
  p_quantity,p_balance,nullif(btrim(coalesce(p_reason,'')),''),
  v_profile.id,p_witness_id,true,true,v_now
 ) returning id into v_id;

 return v_id;
end;
$$;
revoke all on function public.record_controlled_drug_transaction(uuid,uuid,text,numeric,numeric,text,text,uuid,text) from public;
grant execute on function public.record_controlled_drug_transaction(uuid,uuid,text,numeric,numeric,text,text,uuid,text) to authenticated;

-- Remove all browser table-write paths for the controlled-drug register. New
-- transactions must pass through one of the two dual-PIN functions above.
drop policy if exists controlled_drug_register_staff_insert on public.controlled_drug_register;
drop policy if exists controlled_drug_register_supervisor_all on public.controlled_drug_register;
revoke insert,update,delete on public.controlled_drug_register from authenticated;
grant select on public.controlled_drug_register to authenticated;

-- -------------------------------------------------------------------------
-- 5. Automatic participant timeline synchronisation
-- -------------------------------------------------------------------------

do $timeline_duplicates$
begin
 if exists(
  select related_mar_entry_id
  from public.client_timeline
  where related_mar_entry_id is not null
  group by related_mar_entry_id having count(*)>1
 ) then
  raise exception 'Duplicate MAR-linked timeline events exist. Resolve them before this upgrade.';
 end if;
 if exists(
  select related_progress_note_id
  from public.client_timeline
  where related_progress_note_id is not null
  group by related_progress_note_id having count(*)>1
 ) then
  raise exception 'Duplicate progress-note-linked timeline events exist. Resolve them before this upgrade.';
 end if;
end;
$timeline_duplicates$;

create unique index if not exists client_timeline_mar_entry_unique
 on public.client_timeline(related_mar_entry_id)
 where related_mar_entry_id is not null;
create unique index if not exists client_timeline_progress_note_unique
 on public.client_timeline(related_progress_note_id)
 where related_progress_note_id is not null;

create or replace function public.sync_mar_entry_to_timeline()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
 v_medication public.medications%rowtype;
 v_actor_name text;
 v_witness_name text;
 v_title text;
 v_description text;
 v_action text;
 v_severity public.timeline_severity;
 v_timeline_id uuid;
begin
 select * into v_medication from public.medications where id=new.medication_id;
 select full_name into v_actor_name from public.profiles where id=new.staff_id;
 if new.witnessed_by is not null then
  select full_name into v_witness_name from public.profiles where id=new.witnessed_by;
 end if;

 v_title:='Medication '||lower(new.status::text);
 v_description:=coalesce(v_medication.medication_name,'Medication')
  ||case when nullif(btrim(coalesce(v_medication.dose,'')),'') is not null then ' · '||v_medication.dose else '' end
  ||case when nullif(btrim(coalesce(v_medication.route,'')),'') is not null then ' · '||v_medication.route else '' end
  ||'. Outcome: '||new.status::text||'.';
 if nullif(btrim(coalesce(new.notes,'')),'') is not null then
  v_description:=v_description||' Notes: '||btrim(new.notes);
 end if;
 if new.dual_signoff_required then
  v_description:=v_description||' Schedule 8 dual sign-off completed.';
 end if;

 v_action:='MAR digitally signed by '||coalesce(v_actor_name,'authorised worker');
 if new.dual_signoff_required then
  v_action:=v_action||' and witnessed by '||coalesce(v_witness_name,'second authorised worker');
 end if;
 v_severity:=case when new.status='Administered'::public.mar_status then 'Low'::public.timeline_severity else 'Moderate'::public.timeline_severity end;

 select id into v_timeline_id
 from public.client_timeline
 where related_mar_entry_id=new.id;

 if v_timeline_id is null then
  insert into public.client_timeline(
   organisation_id,participant_id,event_type,severity,occurred_at,title,
   description,action_taken,follow_up,related_mar_entry_id,created_by
  ) values(
   new.organisation_id,new.participant_id,'Medication',v_severity,new.recorded_at,v_title,
   v_description,v_action,null,new.id,new.staff_id
  );
 else
  update public.client_timeline
  set event_type='Medication',severity=v_severity,occurred_at=new.recorded_at,
      title=v_title,description=v_description,action_taken=v_action,
      participant_id=new.participant_id,organisation_id=new.organisation_id
  where id=v_timeline_id;
 end if;
 return new;
end;
$$;

create or replace function public.sync_progress_note_to_timeline()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
 v_actor_name text;
 v_timeline_id uuid;
begin
 select full_name into v_actor_name from public.profiles where id=new.staff_id;
 select id into v_timeline_id
 from public.client_timeline
 where related_progress_note_id=new.id;

 if v_timeline_id is null then
  insert into public.client_timeline(
   organisation_id,participant_id,event_type,severity,occurred_at,title,
   description,action_taken,follow_up,related_progress_note_id,created_by
  ) values(
   new.organisation_id,new.participant_id,'Other','Low',new.recorded_at,
   'Progress note — '||new.category,new.content,
   'Digitally signed by '||coalesce(v_actor_name,'authorised worker')||' · '||new.status,
   null,new.id,new.staff_id
  );
 else
  update public.client_timeline
  set event_type='Other',severity='Low',occurred_at=new.recorded_at,
      title='Progress note — '||new.category,description=new.content,
      action_taken='Digitally signed by '||coalesce(v_actor_name,'authorised worker')||' · '||new.status,
      participant_id=new.participant_id,organisation_id=new.organisation_id
  where id=v_timeline_id;
 end if;
 return new;
end;
$$;

revoke all on function public.sync_mar_entry_to_timeline() from public,authenticated;
revoke all on function public.sync_progress_note_to_timeline() from public,authenticated;

drop trigger if exists mar_entries_timeline_sync on public.mar_entries;
create trigger mar_entries_timeline_sync
after insert or update on public.mar_entries
for each row execute function public.sync_mar_entry_to_timeline();

drop trigger if exists progress_notes_timeline_sync on public.progress_notes;
create trigger progress_notes_timeline_sync
after insert or update on public.progress_notes
for each row execute function public.sync_progress_note_to_timeline();

-- Backfill existing clinical records so Evelyn and every other authorised
-- participant timeline reflects records already stored in Florence.
insert into public.client_timeline(
 organisation_id,participant_id,event_type,severity,occurred_at,title,
 description,action_taken,follow_up,related_mar_entry_id,created_by
)
select
 mar.organisation_id,mar.participant_id,'Medication'::public.timeline_event_type,
 case when mar.status='Administered'::public.mar_status then 'Low'::public.timeline_severity else 'Moderate'::public.timeline_severity end,
 mar.recorded_at,'Medication '||lower(mar.status::text),
 coalesce(med.medication_name,'Medication')
  ||case when nullif(btrim(coalesce(med.dose,'')),'') is not null then ' · '||med.dose else '' end
  ||case when nullif(btrim(coalesce(med.route,'')),'') is not null then ' · '||med.route else '' end
  ||'. Outcome: '||mar.status::text||'.'
  ||case when nullif(btrim(coalesce(mar.notes,'')),'') is not null then ' Notes: '||btrim(mar.notes) else '' end,
 'MAR digitally signed by '||coalesce(worker.full_name,'authorised worker'),
 null,mar.id,mar.staff_id
from public.mar_entries mar
left join public.medications med on med.id=mar.medication_id
left join public.profiles worker on worker.id=mar.staff_id
where not exists(
 select 1 from public.client_timeline timeline
 where timeline.related_mar_entry_id=mar.id
);

insert into public.client_timeline(
 organisation_id,participant_id,event_type,severity,occurred_at,title,
 description,action_taken,follow_up,related_progress_note_id,created_by
)
select
 note.organisation_id,note.participant_id,'Other'::public.timeline_event_type,
 'Low'::public.timeline_severity,note.recorded_at,
 'Progress note — '||note.category,note.content,
 'Digitally signed by '||coalesce(worker.full_name,'authorised worker')||' · '||note.status,
 null,note.id,note.staff_id
from public.progress_notes note
left join public.profiles worker on worker.id=note.staff_id
where not exists(
 select 1 from public.client_timeline timeline
 where timeline.related_progress_note_id=note.id
);

commit;

notify pgrst, 'reload schema';

select
 case
  when to_regprocedure('public.record_medication_administration(uuid,text,public.mar_status,text,uuid,text,numeric,numeric)') is null then 'FAIL_S8_MAR_FUNCTION'
  when to_regprocedure('public.record_controlled_drug_transaction(uuid,uuid,text,numeric,numeric,text,text,uuid,text)') is null then 'FAIL_S8_STOCK_FUNCTION'
  when to_regprocedure('public.sync_mar_entry_to_timeline()') is null then 'FAIL_MAR_TIMELINE_TRIGGER'
  when to_regprocedure('public.sync_progress_note_to_timeline()') is null then 'FAIL_NOTE_TIMELINE_TRIGGER'
  else 'S8_DUAL_SIGNOFF_TIMELINE_READY'
 end as florence_s8_timeline_upgrade,
 (select count(*) from public.mar_entries where dual_signoff_required and witness_pin_verified) as dual_signed_s8_mar_entries,
 (select count(*) from public.client_timeline where related_mar_entry_id is not null) as medication_timeline_entries,
 (select count(*) from public.client_timeline where related_progress_note_id is not null) as progress_note_timeline_entries,
 (select count(*) from public.controlled_drug_register where recorded_pin_verified and witness_pin_verified) as dual_signed_s8_register_entries;
