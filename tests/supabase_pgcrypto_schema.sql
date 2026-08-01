-- Make the ephemeral PostgreSQL service match hosted Supabase extension layout.
-- Supabase installs most extensions, including pgcrypto, beneath `extensions`.

create schema if not exists extensions;
alter extension pgcrypto set schema extensions;

do $$
declare
 v_schema text;
begin
 select namespace.nspname into v_schema
 from pg_extension extension_record
 join pg_namespace namespace on namespace.oid=extension_record.extnamespace
 where extension_record.extname='pgcrypto';

 if v_schema<>'extensions' then
  raise exception 'Expected pgcrypto in extensions schema, found %',coalesce(v_schema,'missing');
 end if;
 if to_regprocedure('extensions.crypt(text,text)') is null
    or to_regprocedure('extensions.gen_salt(text)') is null then
  raise exception 'Supabase-style pgcrypto functions are unavailable';
 end if;
end;
$$;
