begin;

alter table public.staff enable row level security;
alter table public.client enable row level security;
alter table public.medication_log enable row level security;
alter table public.financial_entries enable row level security;
alter table public.audit_log enable row level security;
revoke all on table public.staff, public.client, public.medication_log, public.financial_entries, public.audit_log from anon, authenticated;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.signature);
  end loop;
end $$;

grant execute on function public.current_org_id() to authenticated;
grant execute on function public.current_participant_id() to authenticated;
grant execute on function public."current_role"() to authenticated;
grant execute on function public.can_access_participant(uuid) to authenticated;
grant execute on function public.current_user_can_access_client(uuid) to authenticated;
grant execute on function public.current_user_is_management() to authenticated;
grant execute on function public.has_portal_access(uuid) to authenticated;
grant execute on function public.is_management() to authenticated;
grant execute on function public.is_supervisor() to authenticated;
grant execute on function public.staff_may_witness_participant(uuid,uuid,uuid) to authenticated;
grant execute on function public.has_my_medication_pin() to authenticated;
grant execute on function public.require_verified_mfa() to authenticated;
grant execute on function public.claim_open_shift(uuid) to authenticated;
grant execute on function public.respond_to_shift(uuid,public.shift_response) to authenticated;
grant execute on function public.record_access_event(text,text,text,jsonb) to authenticated;
grant execute on function public.record_controlled_drug_transaction(uuid,uuid,text,numeric,numeric,text,text,uuid,text) to authenticated;
grant execute on function public.record_medication_administration(uuid,text,public.mar_status,text,uuid,text,numeric,numeric) to authenticated;
grant execute on function public.record_progress_note(uuid,text,text,text,text,boolean) to authenticated;
grant execute on function public.set_my_medication_pin(text) to authenticated;
grant execute on function public.set_my_signing_pin(text) to authenticated;
grant execute on function public.sign_scheduled_mar_round(uuid,text,date,text,jsonb) to authenticated;
grant execute on function public.queue_push_notification(uuid,uuid,text,text,text,text,text,timestamptz) to service_role;
grant execute on function public.queue_weekly_family_update_reminders() to service_role;

alter function public.touch_updated_at() set search_path=public,pg_temp;
alter function public.audit_row_change() set search_path=public,extensions,pg_temp;
alter function public.handle_new_user() set search_path=public,extensions,pg_temp;
alter function public.notify_shift_change() set search_path=public,pg_temp;
alter function public.notify_supervisors_of_operation() set search_path=public,pg_temp;
alter function public.queue_progress_note_push_notifications() set search_path=public,pg_temp;
alter function public.queue_shift_push_notifications() set search_path=public,pg_temp;
alter function public.register_retention_record() set search_path=public,pg_temp;
alter function public.revoke_participant_access_on_profile_deactivation() set search_path=public,pg_temp;
alter function public.sync_mar_entry_to_timeline() set search_path=public,pg_temp;
alter function public.sync_progress_note_to_timeline() set search_path=public,pg_temp;
alter function public.validate_participant_access_assignment() set search_path=public,pg_temp;
alter function public.validate_retention_register() set search_path=public,pg_temp;
alter function public.validate_sil_provider_profile() set search_path=public,pg_temp;
alter function public.validate_sil_record() set search_path=public,pg_temp;

create index if not exists medications_org_participant_idx on public.medications(organisation_id,participant_id) where active;
create index if not exists mar_entries_medication_recorded_idx on public.mar_entries(medication_id,recorded_at desc);
create index if not exists mar_entries_participant_recorded_idx on public.mar_entries(participant_id,recorded_at desc);
create index if not exists progress_notes_participant_recorded_idx on public.progress_notes(participant_id,recorded_at desc);
create index if not exists progress_notes_staff_recorded_idx on public.progress_notes(staff_id,recorded_at desc);
create index if not exists shifts_staff_start_idx on public.shifts(assigned_staff_id,starts_at) where status='Published';
create index if not exists shifts_participant_start_idx on public.shifts(participant_id,starts_at);
create index if not exists portal_messages_thread_created_idx on public.portal_messages(thread_id,created_at);
create index if not exists notifications_recipient_created_idx on public.notifications(recipient_id,created_at desc);
create index if not exists push_jobs_recipient_status_idx on public.push_notification_jobs(recipient_id,status,send_after);
create index if not exists family_updates_participant_idx on public.family_update_schedules(participant_id) where active;
create index if not exists account_setup_codes_user_created_idx on public.account_setup_codes(user_id,created_at desc);

notify pgrst, 'reload schema';
commit;
