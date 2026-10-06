-- Recovery for contract-tone-families.sql, executed by a database migration owner.
-- Restores historical mappings and the old read RPC; new HEX entries stay nullable.
-- Keep expansion interfaces so the new applications remain compatible.
begin;
do $$
begin
  if to_regclass('public.tone_families') is not null then
    raise exception 'Legacy families already exist; refusing to overwrite them.' using errcode = '55000';
  end if;
  if to_regclass('private.palette_legacy_tone_families') is null
    or to_regclass('private.palette_legacy_tone_mapping') is null
    or to_regclass('private.palette_legacy_color_ddl') is null then
    raise exception 'Palette recovery snapshot is missing.' using errcode = '55000';
  end if;
end;
$$;
lock table public.tones in access exclusive mode;
create table public.tone_families (like private.palette_legacy_tone_families including all);
insert into public.tone_families select * from private.palette_legacy_tone_families;
-- Creation can inherit newer DEFAULT PRIVILEGES. Clear every non-owner
-- grantee, including service_role/custom roles absent from the saved ACL.
do $clear_new_table_acl$
declare grantee record;
begin
  for grantee in
    select distinct acl.grantee
    from pg_class c cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
    where c.oid = 'public.tone_families'::regclass and acl.grantee <> c.relowner
  loop
    execute format('revoke all on table public.tone_families from %s',
      case when grantee.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(grantee.grantee)) end);
  end loop;
end;
$clear_new_table_acl$;
alter table public.tones add column family_id uuid;
update public.tones t set family_id = snapshot.family_id
from private.palette_legacy_tone_mapping snapshot where t.id = snapshot.tone_id;
alter table public.tones add constraint tones_family_id_fkey foreign key(family_id) references public.tone_families(id) on delete restrict;
create index idx_tones_family_id_id on public.tones(family_id,id);
do $restore_ddl$
declare saved record; grantee record;
begin
  for saved in select ordinal, restoration_sql from private.palette_legacy_color_ddl order by ordinal loop
    execute saved.restoration_sql;
    if saved.ordinal = 2000 then
      for grantee in
        select distinct acl.grantee
        from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        where p.oid = to_regprocedure('public.get_archive_videos(uuid,uuid[],text[],integer,integer)')
          and acl.grantee <> p.proowner
      loop
        execute format('revoke all on function public.get_archive_videos(uuid,uuid[],text[],integer,integer) from %s',
          case when grantee.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(grantee.grantee)) end);
      end loop;
    end if;
  end loop;
end;
$restore_ddl$;
commit;
