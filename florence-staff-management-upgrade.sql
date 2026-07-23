-- Florence staff management and private signing PIN upgrade
-- Non-destructive: run once in Supabase SQL Editor.

create or replace function public.set_my_signing_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
 if p_pin is null or p_pin !~ '^[0-9]{6}$' then
  raise exception 'PIN must contain exactly six numbers';
 end if;
 update public.profiles
 set medication_pin_hash=crypt(p_pin,gen_salt('bf')),updated_at=now()
 where id=auth.uid() and active=true and role in ('staff','supervisor');
 if not found then raise exception 'Active staff profile not found'; end if;
end;
$$;

grant execute on function public.set_my_signing_pin(text) to authenticated;
