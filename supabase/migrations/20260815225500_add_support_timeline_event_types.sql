-- Keep automatically generated care timeline events semantically distinct.
-- These labels are already emitted by the signed support, transport and
-- medication-error workflows, so they must exist before those records save.

alter type public.timeline_event_type add value if not exists 'Community support';
alter type public.timeline_event_type add value if not exists 'Transport';
alter type public.timeline_event_type add value if not exists 'Medication error';
