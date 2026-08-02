begin;

alter table public.participants
  add column if not exists care_plan_version integer not null default 1,
  add column if not exists care_plan_effective_from date,
  add column if not exists care_plan_review_date date,
  add column if not exists care_plan_approved_by uuid references public.profiles(id),
  add column if not exists care_plan_approved_at timestamptz,
  add column if not exists care_plan_acknowledged_at timestamptz;

create index if not exists participants_care_plan_review_idx
  on public.participants(care_plan_review_date)
  where status='Active';

create policy progress_note_amendments_authorised_select
on public.progress_note_amendments
for select to authenticated
using (
  exists (
    select 1
    from public.progress_notes n
    where n.id=progress_note_id
      and n.organisation_id=public.current_org_id()
      and public.can_access_participant(n.participant_id)
  )
);

create table if not exists public.weekly_family_updates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  week_ending date not null,
  health_wellbeing text,
  activities_appointments text,
  goals_progress text,
  medication_clinical_updates text,
  concerns_follow_up text,
  completed_by uuid not null references public.profiles(id),
  completed_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  portal_thread_id uuid references public.portal_threads(id),
  portal_message_id uuid references public.portal_messages(id),
  unique (participant_id, week_ending)
);
alter table public.weekly_family_updates enable row level security;
create policy weekly_family_updates_staff_select
on public.weekly_family_updates for select to authenticated
using (organisation_id=public.current_org_id() and public.can_access_participant(participant_id));
create policy weekly_family_updates_staff_insert
on public.weekly_family_updates for insert to authenticated
with check (
  organisation_id=public.current_org_id()
  and completed_by=auth.uid()
  and public.can_access_participant(participant_id)
  and public."current_role"() in ('staff','supervisor')
);
create policy weekly_family_updates_supervisor_update
on public.weekly_family_updates for update to authenticated
using (organisation_id=public.current_org_id() and public.is_supervisor())
with check (organisation_id=public.current_org_id() and public.is_supervisor());

create index if not exists weekly_family_updates_participant_week_idx
  on public.weekly_family_updates(participant_id,week_ending desc);

notify pgrst, 'reload schema';
commit;
