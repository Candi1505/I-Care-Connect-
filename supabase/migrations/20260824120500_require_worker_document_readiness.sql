-- Require every worker to open and individually acknowledge the current
-- worker-facing controlled documents before their next Florence clock-in.

create table if not exists public.worker_document_reads (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  staff_id uuid not null references public.profiles(id) on delete cascade,
  document_id uuid not null references public.compliance_documents(id) on delete restrict,
  document_version integer not null,
  opened_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (staff_id, document_id, document_version)
);

comment on table public.worker_document_reads is
  'Server-recorded evidence that a worker opened a specific current controlled-document version before acknowledging it.';

create index if not exists worker_document_reads_staff_version_idx
  on public.worker_document_reads (staff_id, document_id, document_version);

alter table public.worker_document_reads enable row level security;

revoke all on table public.worker_document_reads from public, anon, authenticated;
grant select on table public.worker_document_reads to authenticated;

drop policy if exists worker_document_reads_select on public.worker_document_reads;
create policy worker_document_reads_select
on public.worker_document_reads
for select
to authenticated
using (
  organisation_id = public.current_org_id()
  and (staff_id = auth.uid() or public.is_supervisor())
);

-- Keep the complete governance library supervisor-only. Workers may read only
-- approved current documents explicitly classified for worker access.
drop policy if exists compliance_documents_mfa_required on public.compliance_documents;
create policy compliance_documents_mfa_required
on public.compliance_documents
as restrictive
for all
to authenticated
using (coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2')
with check (coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2');

drop policy if exists compliance_select on public.compliance_documents;
create policy compliance_select
on public.compliance_documents
for select
to authenticated
using (
  organisation_id = public.current_org_id()
  and (
    public.is_supervisor()
    or (
      scope = 'Organisation'
      and category = 'Controlled library'
      and lifecycle_status = 'Approved'
      and approved_at is not null
      and (review_date is null or review_date >= current_date)
      and (
        (
          public.current_role()::text in ('staff', 'support_worker')
          and access_level = 'worker'
          and public.is_worker_controlled_document(title)
        )
        or (
          public.current_role()::text in ('family', 'client')
          and public.is_portal_controlled_document(title)
        )
      )
    )
    or (scope = 'Staff' and subject_id = auth.uid())
    or (scope = 'Participant' and public.can_access_participant(subject_id))
  )
);

create or replace function public.record_worker_document_open(
  p_document_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_document public.compliance_documents%rowtype;
  v_id uuid;
begin
  perform public.require_verified_mfa();

  select * into v_profile
  from public.profiles
  where id = auth.uid()
    and active = true
    and role in ('staff', 'supervisor');

  if v_profile.id is null then
    raise exception 'An active Florence worker account is required';
  end if;

  select * into v_document
  from public.compliance_documents
  where id = p_document_id
    and organisation_id = v_profile.organisation_id
    and scope = 'Organisation'
    and category = 'Controlled library'
    and lifecycle_status = 'Approved'
    and approved_at is not null
    and (review_date is null or review_date >= current_date)
    and access_level = 'worker'
    and public.is_worker_controlled_document(title);

  if v_document.id is null then
    raise exception 'This required worker document is not current or is not assigned to your role';
  end if;

  insert into public.worker_document_reads (
    organisation_id, staff_id, document_id, document_version,
    opened_at, last_opened_at
  ) values (
    v_profile.organisation_id, v_profile.id, v_document.id,
    v_document.version, now(), now()
  )
  on conflict (staff_id, document_id, document_version)
  do update set last_opened_at = excluded.last_opened_at
  returning id into v_id;

  insert into public.audit_events (
    organisation_id, actor_id, table_name, record_id, action, after_data
  ) values (
    v_profile.organisation_id, v_profile.id, 'worker_document_reads',
    v_id::text, 'VIEW',
    jsonb_build_object(
      'document_id', v_document.id,
      'document_version', v_document.version,
      'title', v_document.title,
      'event', 'required_worker_document_opened'
    )
  );

  return v_id;
end;
$$;

revoke all on function public.record_worker_document_open(uuid) from public, anon;
grant execute on function public.record_worker_document_open(uuid) to authenticated;

create or replace function public.acknowledge_worker_document(
  p_document_id uuid,
  p_pin text,
  p_declaration_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_document public.compliance_documents%rowtype;
  v_id uuid;
begin
  perform public.require_verified_mfa();

  select * into v_profile
  from public.profiles
  where id = auth.uid()
    and active = true
    and role in ('staff', 'supervisor');

  if v_profile.id is null then
    raise exception 'An active Florence worker account is required';
  end if;
  if not coalesce(p_declaration_confirmed, false) then
    raise exception 'Confirm that you have read and understood this document';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{6}$'
     or v_profile.medication_pin_hash is null
     or crypt(p_pin, v_profile.medication_pin_hash) <> v_profile.medication_pin_hash then
    raise exception 'Your signing PIN was not accepted';
  end if;

  select * into v_document
  from public.compliance_documents
  where id = p_document_id
    and organisation_id = v_profile.organisation_id
    and scope = 'Organisation'
    and category = 'Controlled library'
    and lifecycle_status = 'Approved'
    and approved_at is not null
    and (review_date is null or review_date >= current_date)
    and access_level = 'worker'
    and public.is_worker_controlled_document(title);

  if v_document.id is null then
    raise exception 'This required worker document is not current';
  end if;
  if not exists (
    select 1
    from public.worker_document_reads r
    where r.staff_id = v_profile.id
      and r.document_id = v_document.id
      and r.document_version = v_document.version
  ) then
    raise exception 'Open and read this current document before acknowledging it';
  end if;

  insert into public.worker_document_acknowledgements (
    organisation_id, staff_id, document_id, document_version, acknowledged_at
  ) values (
    v_profile.organisation_id, v_profile.id, v_document.id,
    v_document.version, now()
  )
  on conflict (staff_id, document_id, document_version)
  do update set acknowledged_at = excluded.acknowledged_at
  returning id into v_id;

  insert into public.audit_events (
    organisation_id, actor_id, table_name, record_id, action, after_data
  ) values (
    v_profile.organisation_id, v_profile.id,
    'worker_document_acknowledgements', v_id::text, 'INSERT',
    jsonb_build_object(
      'document_id', v_document.id,
      'document_version', v_document.version,
      'title', v_document.title,
      'event', 'required_worker_document_acknowledged'
    )
  );

  return v_id;
end;
$$;

revoke all on function public.acknowledge_worker_document(uuid, text, boolean) from public, anon;
grant execute on function public.acknowledge_worker_document(uuid, text, boolean) to authenticated;

create or replace function public.acknowledge_worker_documents(
  p_document_ids uuid[],
  p_pin text,
  p_declaration_confirmed boolean
)
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_document public.compliance_documents%rowtype;
  v_document_id uuid;
  v_acknowledgement_id uuid;
  v_count integer := 0;
begin
  perform public.require_verified_mfa();

  select * into v_profile
  from public.profiles
  where id = auth.uid()
    and active = true
    and role in ('staff', 'supervisor');

  if v_profile.id is null then
    raise exception 'An active Florence worker account is required';
  end if;
  if not coalesce(p_declaration_confirmed, false) then
    raise exception 'Check each document you have read and understood';
  end if;
  if coalesce(cardinality(p_document_ids), 0) < 1
     or cardinality(p_document_ids) > 100 then
    raise exception 'Choose between 1 and 100 opened documents to acknowledge';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{6}$'
     or v_profile.medication_pin_hash is null
     or crypt(p_pin, v_profile.medication_pin_hash) <> v_profile.medication_pin_hash then
    raise exception 'Your signing PIN was not accepted';
  end if;

  for v_document_id in
    select distinct item from unnest(p_document_ids) as item
  loop
    select * into v_document
    from public.compliance_documents
    where id = v_document_id
      and organisation_id = v_profile.organisation_id
      and scope = 'Organisation'
      and category = 'Controlled library'
      and lifecycle_status = 'Approved'
      and approved_at is not null
      and (review_date is null or review_date >= current_date)
      and access_level = 'worker'
      and public.is_worker_controlled_document(title);

    if v_document.id is null then
      raise exception 'One selected worker document is no longer current';
    end if;
    if not exists (
      select 1
      from public.worker_document_reads r
      where r.staff_id = v_profile.id
        and r.document_id = v_document.id
        and r.document_version = v_document.version
    ) then
      raise exception 'Open and read every selected document before signing';
    end if;

    insert into public.worker_document_acknowledgements (
      organisation_id, staff_id, document_id, document_version, acknowledged_at
    ) values (
      v_profile.organisation_id, v_profile.id, v_document.id,
      v_document.version, now()
    )
    on conflict (staff_id, document_id, document_version)
    do update set acknowledged_at = excluded.acknowledged_at
    returning id into v_acknowledgement_id;

    insert into public.audit_events (
      organisation_id, actor_id, table_name, record_id, action, after_data
    ) values (
      v_profile.organisation_id, v_profile.id,
      'worker_document_acknowledgements', v_acknowledgement_id::text, 'INSERT',
      jsonb_build_object(
        'document_id', v_document.id,
        'document_version', v_document.version,
        'title', v_document.title,
        'event', 'required_worker_document_acknowledged'
      )
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.acknowledge_worker_documents(uuid[], text, boolean) from public, anon;
grant execute on function public.acknowledge_worker_documents(uuid[], text, boolean) to authenticated;

create or replace function public.my_worker_document_readiness()
returns table (
  document_id uuid,
  title text,
  module text,
  version integer,
  review_date date,
  storage_path text,
  opened_at timestamptz,
  acknowledged_at timestamptz,
  ready boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
begin
  perform public.require_verified_mfa();

  select * into v_profile
  from public.profiles
  where id = auth.uid()
    and active = true
    and role in ('staff', 'supervisor');

  if v_profile.id is null then
    raise exception 'An active Florence worker account is required';
  end if;

  return query
  select d.id, d.title, d.module, d.version, d.review_date, d.storage_path,
         r.opened_at, a.acknowledged_at,
         (r.id is not null and a.id is not null) as ready
  from public.compliance_documents d
  left join public.worker_document_reads r
    on r.staff_id = v_profile.id
   and r.document_id = d.id
   and r.document_version = d.version
  left join public.worker_document_acknowledgements a
    on a.staff_id = v_profile.id
   and a.document_id = d.id
   and a.document_version = d.version
  where d.organisation_id = v_profile.organisation_id
    and d.scope = 'Organisation'
    and d.category = 'Controlled library'
    and d.lifecycle_status = 'Approved'
    and d.approved_at is not null
    and (d.review_date is null or d.review_date >= current_date)
    and d.access_level = 'worker'
    and public.is_worker_controlled_document(d.title)
  order by coalesce(d.module, 'Other'), d.title;
end;
$$;

revoke all on function public.my_worker_document_readiness() from public, anon;
grant execute on function public.my_worker_document_readiness() to authenticated;

create or replace function public.clock_in_timesheet(
 p_shift_id uuid default null,
 p_work_type text default 'Participant support',
 p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
 v_profile public.profiles%rowtype;
 v_shift public.shifts%rowtype;
 v_id uuid;
 v_work_type text;
 v_missing_documents integer;
begin
 perform public.require_verified_mfa();

 select * into v_profile
 from public.profiles
 where id=auth.uid()
   and active=true
   and role in('staff','supervisor');

 if v_profile.id is null then
  raise exception 'Only active workers and supervisors can clock in';
 end if;

 select count(*) into v_missing_documents
 from public.compliance_documents d
 where d.organisation_id = v_profile.organisation_id
   and d.scope = 'Organisation'
   and d.category = 'Controlled library'
   and d.lifecycle_status = 'Approved'
   and d.approved_at is not null
   and (d.review_date is null or d.review_date >= current_date)
   and d.access_level = 'worker'
   and public.is_worker_controlled_document(d.title)
   and not exists (
     select 1
     from public.worker_document_reads r
     join public.worker_document_acknowledgements a
       on a.staff_id = r.staff_id
      and a.document_id = r.document_id
      and a.document_version = r.document_version
     where r.staff_id = v_profile.id
       and r.document_id = d.id
       and r.document_version = d.version
   );

 if v_missing_documents > 0 then
  raise exception 'Read and acknowledge all current worker documents before clocking in. % document(s) are still outstanding.', v_missing_documents;
 end if;

 if exists(
  select 1 from public.timesheets
  where staff_id=v_profile.id and clock_out is null
 ) then
  raise exception 'You are already clocked in';
 end if;

 v_work_type:=nullif(btrim(coalesce(p_work_type,'')),'');
 if v_work_type is null then
  raise exception 'Choose a work type';
 end if;

 if p_shift_id is not null then
  select * into v_shift
  from public.shifts
  where id=p_shift_id
    and organisation_id=v_profile.organisation_id
    and assigned_staff_id=v_profile.id
    and status='Published';

  if v_shift.id is null then
   raise exception 'This roster shift is not available for your account';
  end if;
  if v_shift.response='Declined' then
   raise exception 'A declined shift cannot be clocked in';
  end if;
  if v_shift.response<>'Accepted' then
   raise exception 'Accept this roster shift before clocking in';
  end if;
 end if;

 insert into public.timesheets(
  organisation_id,staff_id,shift_id,clock_in,work_type,
  clock_in_notes,notes,status,created_at,updated_at
 ) values(
  v_profile.organisation_id,v_profile.id,p_shift_id,clock_timestamp(),v_work_type,
  nullif(btrim(coalesce(p_notes,'')),''),
  concat_ws(E'\n','Work type: '||v_work_type,nullif(btrim(coalesce(p_notes,'')),'')),
  'Open',now(),now()
 ) returning id into v_id;

 return v_id;
end;
$$;

revoke all on function public.clock_in_timesheet(uuid, text, text) from public, anon;
grant execute on function public.clock_in_timesheet(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
