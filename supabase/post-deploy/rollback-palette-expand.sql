-- Optional FULL schema rollback. Prefer reverting application code while keeping
-- the backward-compatible expansion. Stop both apps and take an external backup.
-- Requires the migration owner and:
--   set codex.palette_expand_rollback_verified = 'on';
-- Never deletes videos/colors or silently truncates a palette.
begin;
do $$
begin
  if current_setting('codex.palette_expand_rollback_verified', true) is distinct from 'on' then
    raise exception 'Stop both applications and review full palette rollback first.' using errcode = '55000';
  end if;
  if to_regclass('private.palette_expand_backup_state') is null
    or to_regclass('private.palette_expand_backup_functions') is null
    or to_regclass('private.palette_expand_backup_tones') is null then
    raise exception 'Pre-expansion recovery snapshot is missing.' using errcode = '55000';
  end if;
  if to_regclass('public.tone_families') is null then
    raise exception 'Restore contracted tone families before rolling back expansion.' using errcode = '55000';
  end if;
  if (select count(*) from private.palette_expand_backup_functions) <> 3 then
    raise exception 'The three original publication/limit functions were not fully captured.' using errcode = '55000';
  end if;
end;
$$;
lock table public.tones, public.video_tones, public.videos in access exclusive mode;
do $blockers$
declare conflicts jsonb;
begin
  select jsonb_agg(video_id) into conflicts from (
    select video_id from public.video_tones group by video_id having count(*) > 3
  ) blocked;
  if conflicts is not null then
    raise exception 'Legacy approval permits three colors; explicitly resolve these videos before full rollback.'
      using errcode = '23514', detail = conflicts::text;
  end if;
  if (select (state->>'family_not_null')::boolean from private.palette_expand_backup_state) then
    select jsonb_agg(id) into conflicts from public.tones where family_id is null;
    if conflicts is not null then
      raise exception 'Assign legacy families to these new colors before full rollback.'
        using errcode = '23514', detail = conflicts::text;
    end if;
  end if;
end;
$blockers$;

-- Preserve post-migration metadata before removing its columns. This archive is
-- intentionally not overwritten on a repeated rollback attempt.
create table private.palette_expand_rollback_video_tones as select * from public.video_tones;
alter table private.palette_expand_rollback_video_tones add primary key(video_id, tone_id);
alter table private.palette_expand_rollback_video_tones enable row level security;
create policy deny_client_access on private.palette_expand_rollback_video_tones
  for all to anon, authenticated, service_role using(false) with check(false);
do $secure_archive$
declare grantee record;
begin
  for grantee in
    select distinct a.grantee from pg_class c cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where c.oid = 'private.palette_expand_rollback_video_tones'::regclass and a.grantee <> c.relowner
  loop
    execute format('revoke all on table private.palette_expand_rollback_video_tones from %s',
      case when grantee.grantee = 0 then 'PUBLIC' else quote_ident(pg_get_userbyid(grantee.grantee)) end);
  end loop;
end;
$secure_archive$;

drop function public.approve_submission_with_palette(uuid, uuid, uuid[], jsonb, text);
drop function public.approve_cos_submission_with_palette(uuid, uuid, uuid, text, text, uuid[], jsonb, text);
drop function public.get_archive_videos_by_color(uuid, uuid[], text[], jsonb, text, integer, integer);
drop function private.resolve_palette_tones(jsonb);
drop function private.normalize_video_palette(jsonb);
drop function private.assert_palette_admin();
drop trigger normalize_tone_color_hex on public.tones;
drop function private.normalize_tone_color_hex();
drop trigger enforce_video_tone_max on public.video_tones;
drop index public.idx_tones_color_group_id;
drop function public.tone_color_group(text);
drop function public.color_weighted_rgb_distance(text, text);
drop function public.normalize_color_hex(text);
alter table public.tones drop constraint tones_color_hex_key, drop constraint tones_color_hex_uppercase;
alter table public.video_tones drop constraint video_tones_video_sort_order_key,
  drop constraint video_tones_percentage_range, drop constraint video_tones_sort_order_range,
  drop column percentage, drop column sort_order;

-- Restore only unchanged historical HEX; preserve subsequent manual corrections.
update public.tones t set color_hex = b.color_hex
from private.palette_expand_backup_tones b
where t.id = b.id and t.color_hex = upper(btrim(b.color_hex));
do $restore_original$
declare original record; grantee record; permission jsonb; state jsonb; index_name text;
begin
  select b.state into state from private.palette_expand_backup_state b;
  for original in select * from private.palette_expand_backup_functions order by signature loop
    execute original.definition;
    execute format('alter function %s owner to %I', original.signature, original.owner_name);
    for grantee in
      select distinct a.grantee from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where p.oid = to_regprocedure(original.signature) and a.grantee <> p.proowner
    loop
      execute format('revoke all on function %s from %s', original.signature,
        case when grantee.grantee = 0 then 'PUBLIC' else quote_ident(pg_get_userbyid(grantee.grantee)) end);
    end loop;
    for permission in select * from jsonb_array_elements(original.grants) loop
      execute format('grant %s on function %s to %s%s', permission->>'privilege', original.signature,
        case when permission->>'role' = 'PUBLIC' then 'PUBLIC' else quote_ident(permission->>'role') end,
        case when (permission->>'grantable')::boolean then ' with grant option' else '' end);
    end loop;
  end loop;
  if state->>'trigger_definition' is not null then execute state->>'trigger_definition'; end if;
  if (state->>'family_not_null')::boolean then alter table public.tones alter column family_id set not null; end if;
  if not (state->>'tones_rls')::boolean then alter table public.tones disable row level security; end if;
  if not (state->>'video_tones_rls')::boolean then alter table public.video_tones disable row level security; end if;
  if not (state->>'private_authenticated_usage')::boolean then revoke usage on schema private from authenticated; end if;
  foreach index_name in array array['idx_video_tones_tone_id_video_id', 'idx_videos_public_archive_published_at', 'idx_videos_public_archive_category_published_at'] loop
    if not (state->'existing_indexes' ? index_name) then execute format('drop index public.%I', index_name); end if;
  end loop;
end;
$restore_original$;
notify pgrst, 'reload schema';
commit;
