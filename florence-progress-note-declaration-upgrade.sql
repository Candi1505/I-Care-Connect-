-- Florence progress-note declaration and PIN signing upgrade
-- Non-destructive: run once in Supabase SQL Editor.

alter table public.progress_notes add column if not exists declaration_confirmed boolean not null default false;
alter table public.progress_notes add column if not exists pin_verified boolean not null default false;
alter table public.progress_notes add column if not exists signed_at timestamptz;

create or replace function public.record_progress_note(
 p_participant_id uuid,
 p_category text,
 p_content text,
 p_status text,
 p_pin text,
 p_declaration_confirmed boolean
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
 v_profile public.profiles;
 v_note_id uuid;
begin
 select * into v_profile from public.profiles where id=auth.uid() and active=true;
 if v_profile.id is null or v_profile.role not in ('supervisor','staff') then
  raise exception 'Only active staff can sign progress notes';
 end if;
 if p_declaration_confirmed is not true then
  raise exception 'Confirm that the progress note is true and correct';
 end if;
 if p_content is null or btrim(p_content)='' then
  raise exception 'Progress note content is required';
 end if;
 if v_profile.medication_pin_hash is null or crypt(p_pin,v_profile.medication_pin_hash)<>v_profile.medication_pin_hash then
  raise exception 'Incorrect PIN';
 end if;
 if not exists(select 1 from public.participants where id=p_participant_id and organisation_id=v_profile.organisation_id) then
  raise exception 'Participant is not available';
 end if;
 insert into public.progress_notes(organisation_id,participant_id,staff_id,category,content,status,declaration_confirmed,pin_verified,signed_at)
 values(v_profile.organisation_id,p_participant_id,v_profile.id,p_category,p_content,coalesce(nullif(p_status,''),'Final'),true,true,now())
 returning id into v_note_id;
 return v_note_id;
end;
$$;

grant execute on function public.record_progress_note(uuid,text,text,text,text,boolean) to authenticated;
