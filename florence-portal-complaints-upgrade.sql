-- Florence family and participant portal complaints workflow
-- Additive and rerunnable. Apply after florence-s8-dual-signoff-timeline-upgrade.sql.
-- This migration does not expose incident, clinical, staff or other complainants' records.

\set ON_ERROR_STOP on

alter type public.portal_thread_type add value if not exists 'Complaint or feedback';

alter table public.complaints
 add column if not exists portal_thread_id uuid;

do $$
begin
 if not exists(
  select 1 from pg_constraint
  where conname='complaints_portal_thread_id_fkey'
    and conrelid='public.complaints'::regclass
 ) then
  alter table public.complaints
   add constraint complaints_portal_thread_id_fkey
   foreign key(portal_thread_id) references public.portal_threads(id) on delete set null;
 end if;
end;
$$;

create unique index if not exists complaints_portal_thread_unique
 on public.complaints(portal_thread_id)
 where portal_thread_id is not null;

create index if not exists complaints_submitter_received_idx
 on public.complaints(submitted_by,received_at desc);

do $$
begin
 if to_regprocedure('public.notify_supervisors_of_operation()') is null then
  raise exception 'Run florence-audit-readiness-upgrade.sql before the portal complaints upgrade';
 end if;
end;
$$;
drop trigger if exists complaints_notify on public.complaints;
create trigger complaints_notify
 after insert on public.complaints
 for each row execute function public.notify_supervisors_of_operation();

-- Complaint conversations are private to the complainant and supervisors. The
-- standard participant-linked portal policies are intentionally narrower here
-- so another family or participant account linked to the same person cannot
-- read or write the complaint thread.
drop policy if exists portal_threads_select on public.portal_threads;
create policy portal_threads_select on public.portal_threads for select to authenticated
using(
 organisation_id=public.current_org_id()
 and public.can_access_participant(participant_id)
 and (
  thread_type<>'Complaint or feedback'
  or public.is_supervisor()
  or created_by=(select auth.uid())
 )
);

drop policy if exists portal_threads_insert on public.portal_threads;
create policy portal_threads_insert on public.portal_threads for insert to authenticated
with check(
 organisation_id=public.current_org_id()
 and created_by=(select auth.uid())
 and public.can_access_participant(participant_id)
 and thread_type<>'Complaint or feedback'
);

drop policy if exists portal_threads_update on public.portal_threads;
create policy portal_threads_update on public.portal_threads for update to authenticated
using(
 organisation_id=public.current_org_id()
 and public.can_access_participant(participant_id)
 and thread_type<>'Complaint or feedback'
)
with check(
 organisation_id=public.current_org_id()
 and public.can_access_participant(participant_id)
 and thread_type<>'Complaint or feedback'
);

drop policy if exists portal_messages_select on public.portal_messages;
create policy portal_messages_select on public.portal_messages for select to authenticated
using(
 organisation_id=public.current_org_id()
 and exists(
  select 1 from public.portal_threads thread_record
  where thread_record.id=thread_id
    and thread_record.organisation_id=public.current_org_id()
    and public.can_access_participant(thread_record.participant_id)
    and (
     thread_record.thread_type<>'Complaint or feedback'
     or public.is_supervisor()
     or thread_record.created_by=(select auth.uid())
    )
 )
);

drop policy if exists portal_messages_insert on public.portal_messages;
create policy portal_messages_insert on public.portal_messages for insert to authenticated
with check(
 organisation_id=public.current_org_id()
 and sender_id=(select auth.uid())
 and exists(
  select 1 from public.portal_threads thread_record
  where thread_record.id=thread_id
    and thread_record.organisation_id=public.current_org_id()
    and public.can_access_participant(thread_record.participant_id)
    and thread_record.thread_type<>'Complaint or feedback'
 )
);

create or replace function public.submit_portal_complaint(
 p_subject text,
 p_details text,
 p_desired_outcome text default null,
 p_advocate_details text default null
)
returns table(complaint_id uuid,thread_id uuid)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
 v_profile public.profiles%rowtype;
 v_thread_id uuid;
 v_complaint_id uuid;
 v_subject text:=btrim(coalesce(p_subject,''));
 v_details text:=btrim(coalesce(p_details,''));
begin
 perform public.require_verified_mfa();

 select * into v_profile
 from public.profiles
 where id=auth.uid() and active=true;

 if not found then raise exception 'Active Florence profile required'; end if;
 if v_profile.role not in('family','client') then
  raise exception 'A family or participant portal account is required';
 end if;
 if v_profile.participant_id is null then
  raise exception 'This portal account is not linked to a participant';
 end if;
 if char_length(v_subject)<3 or char_length(v_subject)>180 then
  raise exception 'Enter a complaint subject between 3 and 180 characters';
 end if;
 if char_length(v_details)<10 or char_length(v_details)>10000 then
  raise exception 'Tell us what happened using between 10 and 10000 characters';
 end if;

 insert into public.portal_threads(
  organisation_id,participant_id,thread_type,subject,status,created_by,updated_at
 ) values(
  v_profile.organisation_id,v_profile.participant_id,'Complaint or feedback',v_subject,'Open',auth.uid(),now()
 ) returning id into v_thread_id;

 insert into public.portal_messages(organisation_id,thread_id,sender_id,message)
 values(v_profile.organisation_id,v_thread_id,auth.uid(),v_details);

 insert into public.complaints(
  organisation_id,participant_id,submitted_by,complainant_name,complainant_contact,
  channel,subject,details,desired_outcome,advocate_details,status,portal_thread_id
 ) values(
  v_profile.organisation_id,v_profile.participant_id,auth.uid(),v_profile.full_name,v_profile.email,
  'Portal',v_subject,v_details,nullif(btrim(coalesce(p_desired_outcome,'')),''),
  nullif(btrim(coalesce(p_advocate_details,'')),''),'Received',v_thread_id
 ) returning id into v_complaint_id;

 return query select v_complaint_id,v_thread_id;
end;
$$;

revoke all on function public.submit_portal_complaint(text,text,text,text) from public;
revoke all on function public.submit_portal_complaint(text,text,text,text) from anon;
grant execute on function public.submit_portal_complaint(text,text,text,text) to authenticated;

create or replace function public.reply_to_portal_complaint(
 p_complaint_id uuid,
 p_message text,
 p_status text default null
)
returns table(complaint_id uuid,thread_id uuid,status text,message_id uuid)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
 v_profile public.profiles%rowtype;
 v_complaint public.complaints%rowtype;
 v_message text:=btrim(coalesce(p_message,''));
 v_new_status text;
 v_thread_status public.portal_thread_status;
 v_message_id uuid;
begin
 perform public.require_verified_mfa();

 select * into v_profile
 from public.profiles
 where id=auth.uid() and active=true;
 if not found then raise exception 'Active Florence profile required'; end if;

 select * into v_complaint
 from public.complaints
 where id=p_complaint_id and organisation_id=v_profile.organisation_id
 for update;
 if not found then raise exception 'Complaint not found'; end if;
 if v_complaint.portal_thread_id is null then raise exception 'This legacy complaint has no portal conversation'; end if;
 if v_profile.role<>'supervisor' and v_complaint.submitted_by<>auth.uid() then
  raise exception 'You cannot access this complaint conversation';
 end if;
 if char_length(v_message)<2 or char_length(v_message)>10000 then
  raise exception 'Enter a reply between 2 and 10000 characters';
 end if;

 if v_profile.role='supervisor' then
  v_new_status:=coalesce(nullif(btrim(coalesce(p_status,'')),''),case when v_complaint.status='Received' then 'Acknowledged' else v_complaint.status end);
  if v_new_status not in('Acknowledged','In review','Resolved') then
   raise exception 'Choose Acknowledged, In review or Resolved';
  end if;
  v_thread_status:=case when v_new_status='Resolved' then 'Resolved'::public.portal_thread_status else 'In progress'::public.portal_thread_status end;
  update public.complaints set
   status=v_new_status,
   acknowledged_at=coalesce(acknowledged_at,now()),
   assigned_to=coalesce(assigned_to,auth.uid()),
   outcome=case when v_new_status='Resolved' then v_message else outcome end,
   appeal_information=case when v_new_status='Resolved' then coalesce(appeal_information,'Reply in this complaint conversation if you would like further review or wish to provide more information.') else appeal_information end,
   resolved_at=case when v_new_status='Resolved' then now() else null end,
   updated_at=now()
  where id=v_complaint.id;
 else
  v_new_status:=case when v_complaint.status='Resolved' then 'Further review requested' else v_complaint.status end;
  v_thread_status:='In progress'::public.portal_thread_status;
  if v_complaint.status='Resolved' then
   update public.complaints set status=v_new_status,resolved_at=null,updated_at=now()
   where id=v_complaint.id;
  end if;
 end if;

 insert into public.portal_messages(organisation_id,thread_id,sender_id,message)
 values(v_profile.organisation_id,v_complaint.portal_thread_id,auth.uid(),v_message)
 returning id into v_message_id;

 update public.portal_threads
 set status=v_thread_status,assigned_to=case when v_profile.role='supervisor' then coalesce(assigned_to,auth.uid()) else assigned_to end,updated_at=now()
 where id=v_complaint.portal_thread_id and organisation_id=v_profile.organisation_id;

 if v_profile.role='supervisor' then
  insert into public.notifications(organisation_id,recipient_id,title,body,category,related_record_id)
  select v_profile.organisation_id,v_complaint.submitted_by,'Supervisor replied to your complaint',
   'Your private complaint conversation has a new reply.','Complaint',v_complaint.id
  where v_complaint.submitted_by is not null and v_complaint.submitted_by<>auth.uid();
 else
  insert into public.notifications(organisation_id,recipient_id,title,body,category,related_record_id)
  select v_profile.organisation_id,id,'New reply to a complaint',
   'A private complaint conversation requires supervisor review.','Complaint',v_complaint.id
  from public.profiles
  where organisation_id=v_profile.organisation_id and role='supervisor' and active=true and id<>auth.uid();
 end if;

 return query select v_complaint.id,v_complaint.portal_thread_id,v_new_status,v_message_id;
end;
$$;

revoke all on function public.reply_to_portal_complaint(uuid,text,text) from public;
revoke all on function public.reply_to_portal_complaint(uuid,text,text) from anon;
grant execute on function public.reply_to_portal_complaint(uuid,text,text) to authenticated;

comment on function public.submit_portal_complaint(text,text,text,text)
 is 'Atomically records a linked participant portal complaint, conversation and supervisor notification.';
comment on function public.reply_to_portal_complaint(uuid,text,text)
 is 'Appends a private complaint reply, updates supervisor review status and notifies the other party.';

select 'PORTAL_COMPLAINTS_READY' as florence_portal_complaints_status;
