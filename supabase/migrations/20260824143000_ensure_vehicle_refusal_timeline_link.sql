begin;

alter table public.client_timeline
  add column if not exists related_sil_record_id uuid
  references public.sil_records(id) on delete set null;

create index if not exists client_timeline_related_sil_record_idx
  on public.client_timeline(related_sil_record_id)
  where related_sil_record_id is not null;

commit;
