create index if not exists medication_effect_reports_organisation_id_idx on public.medication_effect_reports(organisation_id);
create index if not exists medication_effect_reports_participant_occurred_idx on public.medication_effect_reports(participant_id, occurred_at desc);
create index if not exists medication_effect_reports_medication_id_idx on public.medication_effect_reports(medication_id) where medication_id is not null;
create index if not exists medication_effect_reports_mar_entry_id_idx on public.medication_effect_reports(mar_entry_id) where mar_entry_id is not null;
create index if not exists medication_effect_reports_reported_by_idx on public.medication_effect_reports(reported_by);
create index if not exists medication_effect_reports_signed_by_idx on public.medication_effect_reports(signed_by);
create index if not exists medication_effect_reports_reviewed_by_idx on public.medication_effect_reports(reviewed_by) where reviewed_by is not null;
