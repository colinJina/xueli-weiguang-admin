-- Read-only preflight. Execute only with authorized access to the target database.
-- Outputs conflicting IDs/dependency names, not the whole color dictionary.
select upper(btrim(color_hex)) as hex, array_agg(id order by id) as conflicting_tone_ids
from public.tones group by upper(btrim(color_hex)) having count(*) > 1;

select id as invalid_tone_id from public.tones
where color_hex is null or btrim(color_hex) !~ '^#[0-9A-Fa-f]{6}$';

select video_id, count(*) as color_count from public.video_tones group by video_id having count(*) > 5;

select pg_describe_object(dependency.classid, dependency.objid, dependency.objsubid) as dependent_object,
       dependency.deptype
from pg_depend dependency
where dependency.refobjid = 'public.tone_families'::regclass
   or (dependency.refobjid = 'public.tones'::regclass and dependency.refobjsubid = (
     select attnum from pg_attribute where attrelid = 'public.tones'::regclass and attname = 'family_id'
   ));

select p.oid::regprocedure::text as function_dependency
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','private') and p.prokind = 'f'
  and (pg_get_functiondef(p.oid) ~* '\mtone_families\M'
    or (pg_get_functiondef(p.oid) ~* '\mfamily_id\M' and pg_get_functiondef(p.oid) ~* '\mtones\M'));
