-- HOLD: this is intentionally outside migrations. Run after both apps have cut over.
-- First review preflight SQL, take an external schema/data backup, and then set:
--   set codex.palette_frontend_cutover_verified = 'on';
-- No CASCADE: unexpected dependencies abort this entire transaction.
begin;
do $$
begin
  if current_setting('codex.palette_frontend_cutover_verified', true) is distinct from 'on' then
    raise exception 'Verify both application cutovers before deleting legacy tone families.' using errcode = '55000';
  end if;
end;
$$;

lock table public.tone_families, public.tones in access exclusive mode;

-- PostgreSQL does not catalog dependencies inside string-bodied SQL/PLpgSQL.
-- Check their text too; the one known old archive RPC is saved and removed below.
do $function_dependencies$
declare unknown_functions jsonb;
begin
  select jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text)
  into unknown_functions
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prokind = 'f'
    and p.oid <> coalesce(to_regprocedure('public.get_archive_videos(uuid,uuid[],text[],integer,integer)'), 0::oid)
    and (pg_get_functiondef(p.oid) ~* '\mtone_families\M'
      or (pg_get_functiondef(p.oid) ~* '\mfamily_id\M' and pg_get_functiondef(p.oid) ~* '\mtones\M'));
  if unknown_functions is not null then
    raise exception 'Review unknown legacy-color function dependencies before contraction.'
      using errcode = '2BP01', detail = unknown_functions::text;
  end if;
end;
$function_dependencies$;

-- Preserve original rows, ownership, RLS policies, grants, and old RPC definition.
-- A second contraction must not overwrite this first recovery snapshot.
create table private.palette_legacy_tone_families (like public.tone_families including all);
insert into private.palette_legacy_tone_families select * from public.tone_families;
create table private.palette_legacy_tone_mapping as select id as tone_id, family_id from public.tones;
alter table private.palette_legacy_tone_mapping add primary key(tone_id);
create table private.palette_legacy_color_ddl (
  ordinal integer primary key,
  restoration_sql text not null
);

insert into private.palette_legacy_color_ddl values
(0, 'alter table public.tone_families enable row level security;');
insert into private.palette_legacy_color_ddl
select 1, format('alter table public.tone_families owner to %I;', pg_get_userbyid(relowner))
from pg_class where oid = 'public.tone_families'::regclass;
insert into private.palette_legacy_color_ddl
select 2, 'alter table public.tone_families force row level security;'
from pg_class where oid = 'public.tone_families'::regclass and relforcerowsecurity;

insert into private.palette_legacy_color_ddl
select (100 + row_number() over(order by p.polname))::integer,
  format('create policy %I on public.tone_families as %s for %s to %s%s%s;',
    p.polname, case when p.polpermissive then 'permissive' else 'restrictive' end,
    case p.polcmd when '*' then 'all' when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update' when 'd' then 'delete' end,
    (select string_agg(case when role_id = 0 then 'public' else quote_ident(pg_get_userbyid(role_id)) end, ',') from unnest(p.polroles) role_id),
    case when p.polqual is null then '' else ' using (' || pg_get_expr(p.polqual, p.polrelid) || ')' end,
    case when p.polwithcheck is null then '' else ' with check (' || pg_get_expr(p.polwithcheck, p.polrelid) || ')' end)
from pg_policy p where p.polrelid = 'public.tone_families'::regclass;

insert into private.palette_legacy_color_ddl
select (1000 + row_number() over(order by acl.grantee, acl.privilege_type))::integer,
  format('grant %s on public.tone_families to %s%s;', acl.privilege_type,
    case when acl.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(acl.grantee)) end,
    case when acl.is_grantable then ' with grant option' else '' end)
from pg_class c cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
where c.oid = 'public.tone_families'::regclass;

insert into private.palette_legacy_color_ddl
select 2000, pg_get_functiondef(p.oid)
from pg_proc p where p.oid = to_regprocedure('public.get_archive_videos(uuid,uuid[],text[],integer,integer)');
insert into private.palette_legacy_color_ddl
select 2050, format('alter function public.get_archive_videos(uuid,uuid[],text[],integer,integer) owner to %I;', pg_get_userbyid(p.proowner))
from pg_proc p where p.oid = to_regprocedure('public.get_archive_videos(uuid,uuid[],text[],integer,integer)');
insert into private.palette_legacy_color_ddl
select (2100 + row_number() over(order by acl.grantee, acl.privilege_type))::integer,
  format('grant %s on function public.get_archive_videos(uuid,uuid[],text[],integer,integer) to %s%s;',
    acl.privilege_type, case when acl.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(acl.grantee)) end,
    case when acl.is_grantable then ' with grant option' else '' end)
from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
where p.oid = to_regprocedure('public.get_archive_videos(uuid,uuid[],text[],integer,integer)');

alter table private.palette_legacy_tone_families enable row level security;
alter table private.palette_legacy_tone_mapping enable row level security;
alter table private.palette_legacy_color_ddl enable row level security;
-- Explicit deny policies also make the intention visible in security advisors.
create policy palette_snapshot_deny on private.palette_legacy_tone_families as restrictive for all to public using(false) with check(false);
create policy palette_snapshot_deny on private.palette_legacy_tone_mapping as restrictive for all to public using(false) with check(false);
create policy palette_snapshot_deny on private.palette_legacy_color_ddl as restrictive for all to public using(false) with check(false);
revoke all on private.palette_legacy_tone_families, private.palette_legacy_tone_mapping, private.palette_legacy_color_ddl from public, anon, authenticated, service_role;

drop function if exists public.get_archive_videos(uuid, uuid[], text[], integer, integer);
alter table public.tones drop constraint tones_family_id_fkey;
drop index public.idx_tones_family_id_id;
alter table public.tones drop column family_id;
drop table public.tone_families;

comment on table private.palette_legacy_tone_families is 'Recovery snapshot before real-time color palette contraction. Retain until rollback window closes.';
commit;
