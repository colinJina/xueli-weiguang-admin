-- Expand only: deploy both applications before the separately held contraction.
begin;

lock table public.tones, public.video_tones in share row exclusive mode;

-- Refuse ambiguous historical colors. Never silently merge IDs or family data.
do $preflight$
declare
  conflicts jsonb;
begin
  select jsonb_agg(to_jsonb(duplicate) order by duplicate.hex)
  into conflicts
  from (
    select upper(btrim(color_hex)) as hex, array_agg(id order by id) as tone_ids
    from public.tones
    group by upper(btrim(color_hex))
    having count(*) > 1
  ) duplicate;
  if conflicts is not null then
    raise exception 'Duplicate HEX colors require explicit resolution before palette migration.'
      using errcode = '23505', detail = conflicts::text;
  end if;
  if exists (select 1 from public.tones where color_hex is null or btrim(color_hex) !~ '^#[0-9A-Fa-f]{6}$') then
    raise exception 'Invalid historical HEX colors require correction before palette migration.' using errcode = '23514';
  end if;
  if exists (select 1 from public.video_tones group by video_id having count(*) > 5) then
    raise exception 'Historical videos exceed the five-color limit.' using errcode = '23514';
  end if;
end;
$preflight$;

-- Recovery stays inside private: never return the color vocabulary to a client.
-- Refuse to overwrite an earlier snapshot or run this expansion twice.
create table private.palette_expand_backup_state (
  id boolean primary key default true check (id),
  captured_at timestamptz not null default now(),
  state jsonb not null
);
insert into private.palette_expand_backup_state(state)
select jsonb_build_object(
  'family_not_null', (select attnotnull from pg_attribute where attrelid = 'public.tones'::regclass and attname = 'family_id'),
  'tones_rls', (select relrowsecurity from pg_class where oid = 'public.tones'::regclass),
  'video_tones_rls', (select relrowsecurity from pg_class where oid = 'public.video_tones'::regclass),
  'private_authenticated_usage', has_schema_privilege('authenticated', 'private', 'USAGE'),
  'trigger_definition', (select pg_get_triggerdef(oid) from pg_trigger where tgrelid = 'public.video_tones'::regclass and tgname = 'enforce_video_tone_max'),
  'existing_indexes', (select coalesce(jsonb_agg(relname), '[]'::jsonb) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('idx_video_tones_tone_id_video_id', 'idx_videos_public_archive_published_at', 'idx_videos_public_archive_category_published_at'))
);
create table private.palette_expand_backup_functions (
  signature text primary key,
  definition text not null,
  owner_name text not null,
  grants jsonb not null
);
insert into private.palette_expand_backup_functions
select p.oid::regprocedure::text, pg_get_functiondef(p.oid), pg_get_userbyid(p.proowner),
  (select coalesce(jsonb_agg(jsonb_build_object('role', case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
    'privilege', a.privilege_type, 'grantable', a.is_grantable)), '[]'::jsonb)
   from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a)
from pg_proc p where p.oid in (
  to_regprocedure('public.approve_submission(uuid,uuid,uuid[],uuid[],text)'),
  to_regprocedure('public.approve_cos_submission(uuid,uuid,uuid,text,text,uuid[],uuid[],text)'),
  to_regprocedure('private.enforce_video_tone_max()')
);
create table private.palette_expand_backup_tones as select id, color_hex, family_id from public.tones;
alter table private.palette_expand_backup_tones add primary key (id);
create table private.palette_expand_backup_video_tones as select video_id, tone_id from public.video_tones;
alter table private.palette_expand_backup_video_tones add primary key (video_id, tone_id);

do $secure_recovery$
declare recovery_table text; grantee record;
begin
  foreach recovery_table in array array['palette_expand_backup_state', 'palette_expand_backup_functions', 'palette_expand_backup_tones', 'palette_expand_backup_video_tones'] loop
    execute format('alter table private.%I enable row level security', recovery_table);
    execute format('create policy deny_client_access on private.%I for all to anon, authenticated, service_role using (false) with check (false)', recovery_table);
    for grantee in
      select distinct a.grantee from pg_class c cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
      where c.oid = to_regclass('private.' || recovery_table) and a.grantee <> c.relowner
    loop
      execute format('revoke all on table private.%I from %s', recovery_table,
        case when grantee.grantee = 0 then 'PUBLIC' else quote_ident(pg_get_userbyid(grantee.grantee)) end);
    end loop;
  end loop;
end;
$secure_recovery$;

update public.tones set color_hex = upper(btrim(color_hex));
alter table public.tones alter column family_id drop not null;
alter table public.tones add constraint tones_color_hex_key unique (color_hex);

create or replace function public.normalize_color_hex(p_hex text)
returns text
language plpgsql immutable strict parallel safe security invoker
set search_path = ''
as $$
begin
  if btrim(p_hex) !~ '^#?[0-9A-Fa-f]{6}$' then
    raise exception 'Color must be a six-digit HEX value.' using errcode = '22023';
  end if;
  return '#' || upper(ltrim(btrim(p_hex), '#'));
end;
$$;

create or replace function private.normalize_tone_color_hex()
returns trigger
language plpgsql security invoker
set search_path = ''
as $$
begin
  new.color_hex := public.normalize_color_hex(new.color_hex);
  return new;
end;
$$;

create trigger normalize_tone_color_hex
before insert or update of color_hex on public.tones
for each row execute function private.normalize_tone_color_hex();

alter table public.tones
  add constraint tones_color_hex_uppercase check (color_hex ~ '^#[0-9A-F]{6}$');

alter table public.video_tones add column percentage numeric;
alter table public.video_tones add column sort_order integer;
with ranked as (
  select video_id, tone_id, (row_number() over (partition by video_id order by tone_id) - 1)::integer as position
  from public.video_tones
)
update public.video_tones vt
set sort_order = ranked.position
from ranked
where vt.video_id = ranked.video_id and vt.tone_id = ranked.tone_id;

alter table public.video_tones
  alter column sort_order set not null,
  add constraint video_tones_percentage_range check (percentage is null or percentage between 0 and 1),
  add constraint video_tones_sort_order_range check (sort_order between 0 and 4),
  add constraint video_tones_video_sort_order_key unique (video_id, sort_order) deferrable initially deferred;

-- Keep the existing trigger name/function so all current insert paths use max 5.
-- The parent lock serializes additions to one video under Data API READ COMMITTED.
create or replace function private.enforce_video_tone_max()
returns trigger
language plpgsql security invoker
set search_path = ''
as $$
declare
  tone_count integer;
begin
  if tg_op = 'UPDATE' and new.video_id = old.video_id then
    return new;
  end if;
  perform 1 from public.videos where id = new.video_id for update;
  select count(*) into tone_count from public.video_tones where video_id = new.video_id;
  if tone_count >= 5 then
    raise exception 'A video cannot have more than 5 colors.' using errcode = '23514';
  end if;
  if new.sort_order is null then
    select position into new.sort_order
    from generate_series(0, 4) position
    where not exists (
      select 1 from public.video_tones vt where vt.video_id = new.video_id and vt.sort_order = position
    )
    order by position limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_video_tone_max on public.video_tones;
create trigger enforce_video_tone_max
before insert or update of video_id on public.video_tones
for each row execute function private.enforce_video_tone_max();

create or replace function public.tone_color_group(p_hex text)
returns text
language plpgsql immutable strict parallel safe security invoker
set search_path = ''
as $$
declare
  bytes bytea := decode(substr(public.normalize_color_hex(p_hex), 2), 'hex');
  r double precision := get_byte(bytes, 0) / 255.0;
  g double precision := get_byte(bytes, 1) / 255.0;
  b double precision := get_byte(bytes, 2) / 255.0;
  hi double precision := greatest(r, g, b);
  lo double precision := least(r, g, b);
  delta double precision := hi - lo;
  l double precision := (hi + lo) / 2;
  s double precision := 0;
  h double precision := 0;
begin
  if delta > 0 then
    s := delta / (1 - abs(2 * l - 1));
    if hi = r then h := 60 * ((g - b) / delta);
    elsif hi = g then h := 60 * ((b - r) / delta + 2);
    else h := 60 * ((r - g) / delta + 4);
    end if;
    if h < 0 then h := h + 360; end if;
  end if;
  if s < 0.10 or l <= 0.08 or l >= 0.95 then return 'neutral'; end if;
  if h >= 10 and h < 50 and l < 0.45 then return 'brown'; end if;
  if l >= 0.65 and (h < 15 or h >= 330) then return 'pink'; end if;
  if h < 15 or h >= 345 then return 'red'; end if;
  if h < 45 then return 'orange'; end if;
  if h < 75 then return 'yellow'; end if;
  if h < 165 then return 'green'; end if;
  if h < 195 then return 'cyan'; end if;
  if h < 255 then return 'blue'; end if;
  return 'purple';
end;
$$;

create or replace function public.color_weighted_rgb_distance(p_left text, p_right text)
returns double precision
language plpgsql immutable strict parallel safe security invoker
set search_path = ''
as $$
declare
  a bytea := decode(substr(public.normalize_color_hex(p_left), 2), 'hex');
  b bytea := decode(substr(public.normalize_color_hex(p_right), 2), 'hex');
begin
  return sqrt(
    2.0 * power(get_byte(a, 0) - get_byte(b, 0), 2) +
    4.0 * power(get_byte(a, 1) - get_byte(b, 1), 2) +
    3.0 * power(get_byte(a, 2) - get_byte(b, 2), 2)
  );
end;
$$;

create index idx_tones_color_group_id on public.tones (public.tone_color_group(color_hex), id);
create index if not exists idx_video_tones_tone_id_video_id on public.video_tones(tone_id, video_id);
create index if not exists idx_videos_public_archive_published_at
on public.videos(published_at desc, id desc) where published_at is not null;
create index if not exists idx_videos_public_archive_category_published_at
on public.videos(category_id, published_at desc, id desc) where published_at is not null;

revoke all on function public.normalize_color_hex(text), public.tone_color_group(text), public.color_weighted_rgb_distance(text, text) from public;
grant execute on function public.normalize_color_hex(text), public.tone_color_group(text), public.color_weighted_rgb_distance(text, text) to anon, authenticated;
revoke all on function private.normalize_tone_color_hex(), private.enforce_video_tone_max() from public, anon, authenticated;

-- Legacy publication functions below preserve all current metadata/COS behavior.
create or replace function public.approve_submission(
  p_submission_id uuid,
  p_category_id uuid,
  p_tag_ids uuid[] default array[]::uuid[],
  p_tone_ids uuid[] default array[]::uuid[],
  p_review_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_reviewer_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_submission public.submissions%rowtype;
  v_meta jsonb;
  v_video_id uuid;
  v_tag_ids uuid[] := array[]::uuid[];
  v_tone_ids uuid[] := array[]::uuid[];
  v_platform text;
  v_embed_url text;
  v_source_published_epoch numeric;
  v_source_published_at timestamptz;
begin
  if v_reviewer_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select coalesce(p.is_admin, false)
  into v_is_admin
  from public.profiles p
  where p.id = v_reviewer_id;

  if not coalesce(v_is_admin, false) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  if p_submission_id is null then
    raise exception 'Submission id is required.' using errcode = '22023';
  end if;

  if p_category_id is null then
    raise exception 'Category is required.' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct input_id), array[]::uuid[])
  into v_tag_ids
  from unnest(coalesce(p_tag_ids, array[]::uuid[])) as input(input_id)
  where input_id is not null;

  select coalesce(array_agg(distinct input_id), array[]::uuid[])
  into v_tone_ids
  from unnest(coalesce(p_tone_ids, array[]::uuid[])) as input(input_id)
  where input_id is not null;

  if cardinality(v_tag_ids) > 4 then
    raise exception 'Select at most 4 tags.' using errcode = '22023';
  end if;

  if cardinality(v_tone_ids) > 5 then
    raise exception 'Select at most 5 tones.' using errcode = '22023';
  end if;

  perform 1
  from public.categories
  where id = p_category_id;

  if not found then
    raise exception 'Category not found.' using errcode = '23503';
  end if;

  if exists (
    select 1
    from unnest(v_tag_ids) as selected(id)
    left join public.tags t on t.id = selected.id
    where t.id is null
  ) then
    raise exception 'Tag not found.' using errcode = '23503';
  end if;

  if exists (
    select 1
    from unnest(v_tone_ids) as selected(id)
    left join public.tones t on t.id = selected.id
    where t.id is null
  ) then
    raise exception 'Tone not found.' using errcode = '23503';
  end if;

  select *
  into v_submission
  from public.submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception 'Submission not found.' using errcode = 'P0002';
  end if;

  if v_submission.status <> 'pending' then
    raise exception 'Only pending submissions can be approved.' using errcode = '22023';
  end if;

  if v_submission.platform not in ('bilibili', 'youtube')
    or v_submission.storage_provider not in ('bilibili', 'youtube')
    or v_submission.platform <> v_submission.storage_provider
  then
    raise exception 'Unsupported submission source.' using errcode = '22023';
  end if;

  if nullif(trim(coalesce(v_submission.external_id, '')), '') is null then
    raise exception 'External video id is required.' using errcode = '22023';
  end if;

  if nullif(trim(coalesce(v_submission.source_url, '')), '') is null then
    raise exception 'Source url is required.' using errcode = '22023';
  end if;

  if v_submission.fetched_at is null then
    raise exception 'Fetch metadata before approving.' using errcode = '22023';
  end if;

  if v_submission.fetch_error is not null then
    raise exception 'Resolve metadata fetch error before approving.' using errcode = '22023';
  end if;

  v_meta := v_submission.auto_fetched_meta;

  if v_meta is null
    or jsonb_typeof(v_meta) is distinct from 'object'
    or jsonb_typeof(v_meta -> 'title') is distinct from 'string'
    or nullif(v_meta ->> 'title', '') is null
    or jsonb_typeof(v_meta -> 'pic') is distinct from 'string'
    or jsonb_typeof(v_meta -> 'desc') is distinct from 'string'
    or jsonb_typeof(v_meta -> 'ownerName') is distinct from 'string'
    or nullif(v_meta ->> 'ownerName', '') is null
    or jsonb_typeof(v_meta -> 'ownerAvatar') is distinct from 'string'
    or jsonb_typeof(v_meta -> 'viewCount') is distinct from 'number'
    or jsonb_typeof(v_meta -> 'likeCount') is distinct from 'number'
    or jsonb_typeof(v_meta -> 'duration') is distinct from 'number'
    or jsonb_typeof(v_meta -> 'pubdate') is distinct from 'number'
  then
    raise exception 'Cached metadata is incomplete.' using errcode = '22023';
  end if;

  v_source_published_epoch := (v_meta ->> 'pubdate')::numeric;

  if v_source_published_epoch <= 0 or v_source_published_epoch > 253402300799 then
    raise exception 'Cached metadata has an invalid publish date.' using errcode = '22023';
  end if;

  v_source_published_at := to_timestamp(v_source_published_epoch::double precision);
  v_platform := v_submission.platform;

  if v_platform = 'youtube' then
    v_embed_url := 'https://www.youtube-nocookie.com/embed/' || v_submission.external_id;
  else
    v_embed_url := 'https://player.bilibili.com/player.html?bvid=' || v_submission.external_id || '&page=1';
  end if;

  insert into public.videos (
    submission_id,
    platform,
    storage_provider,
    source_url,
    embed_url,
    title,
    cover_url,
    description,
    author_name,
    author_avatar,
    view_count,
    like_count,
    category_id,
    submitted_by,
    published_at
  )
  values (
    v_submission.id,
    v_platform,
    v_platform,
    v_submission.source_url,
    v_embed_url,
    v_meta ->> 'title',
    v_meta ->> 'pic',
    v_meta ->> 'desc',
    v_meta ->> 'ownerName',
    v_meta ->> 'ownerAvatar',
    (v_meta ->> 'viewCount')::bigint,
    (v_meta ->> 'likeCount')::bigint,
    p_category_id,
    v_submission.user_id,
    v_source_published_at
  )
  returning id into v_video_id;

  insert into public.video_tags (video_id, tag_id)
  select v_video_id, tag_id
  from unnest(v_tag_ids) as selected(tag_id);

  insert into public.video_tones (video_id, tone_id)
  select v_video_id, tone_id
  from unnest(v_tone_ids) as selected(tone_id);

  update public.submissions
  set
    status = 'approved',
    reviewed_by = v_reviewer_id,
    reviewed_at = now(),
    review_note = nullif(trim(coalesce(p_review_note, '')), '')
  where id = v_submission.id;

  return v_video_id;
end;
$$;

revoke all on function public.approve_submission(uuid, uuid, uuid[], uuid[], text) from public;
revoke all on function public.approve_submission(uuid, uuid, uuid[], uuid[], text) from anon;
grant execute on function public.approve_submission(uuid, uuid, uuid[], uuid[], text) to authenticated;

create or replace function public.approve_cos_submission(
  p_submission_id uuid,
  p_video_id uuid,
  p_category_id uuid,
  p_playback_ref text,
  p_cover_url text,
  p_tag_ids uuid[] default array[]::uuid[],
  p_tone_ids uuid[] default array[]::uuid[],
  p_review_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_reviewer_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_submission public.submissions%rowtype;
  v_tag_ids uuid[] := array[]::uuid[];
  v_tone_ids uuid[] := array[]::uuid[];
  v_author_name text;
begin
  if v_reviewer_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select coalesce(p.is_admin, false)
  into v_is_admin
  from public.profiles p
  where p.id = v_reviewer_id;

  if not coalesce(v_is_admin, false) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  if p_submission_id is null then
    raise exception 'Submission id is required.' using errcode = '22023';
  end if;

  if p_video_id is null then
    raise exception 'Video id is required.' using errcode = '22023';
  end if;

  if p_category_id is null then
    raise exception 'Category is required.' using errcode = '22023';
  end if;

  if nullif(trim(coalesce(p_playback_ref, '')), '') is null then
    raise exception 'Playback ref is required.' using errcode = '22023';
  end if;

  if nullif(trim(coalesce(p_cover_url, '')), '') is null then
    raise exception 'Cover url is required.' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct input_id), array[]::uuid[])
  into v_tag_ids
  from unnest(coalesce(p_tag_ids, array[]::uuid[])) as input(input_id)
  where input_id is not null;

  select coalesce(array_agg(distinct input_id), array[]::uuid[])
  into v_tone_ids
  from unnest(coalesce(p_tone_ids, array[]::uuid[])) as input(input_id)
  where input_id is not null;

  if cardinality(v_tag_ids) > 4 then
    raise exception 'Select at most 4 tags.' using errcode = '22023';
  end if;

  if cardinality(v_tone_ids) > 5 then
    raise exception 'Select at most 5 tones.' using errcode = '22023';
  end if;

  perform 1
  from public.categories
  where id = p_category_id;

  if not found then
    raise exception 'Category not found.' using errcode = '23503';
  end if;

  if exists (
    select 1
    from unnest(v_tag_ids) as selected(id)
    left join public.tags t on t.id = selected.id
    where t.id is null
  ) then
    raise exception 'Tag not found.' using errcode = '23503';
  end if;

  if exists (
    select 1
    from unnest(v_tone_ids) as selected(id)
    left join public.tones t on t.id = selected.id
    where t.id is null
  ) then
    raise exception 'Tone not found.' using errcode = '23503';
  end if;

  select *
  into v_submission
  from public.submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception 'Submission not found.' using errcode = 'P0002';
  end if;

  if v_submission.status <> 'pending' then
    raise exception 'Only pending submissions can be approved.' using errcode = '22023';
  end if;

  if v_submission.storage_provider <> 'cos' or v_submission.platform <> 'cos' then
    raise exception 'Unsupported submission source.' using errcode = '22023';
  end if;

  if nullif(trim(coalesce(v_submission.source_ref, '')), '') is null then
    raise exception 'COS source ref is required.' using errcode = '22023';
  end if;

  if nullif(trim(coalesce(v_submission.cover_ref, '')), '') is null then
    raise exception 'COS cover ref is required.' using errcode = '22023';
  end if;

  if nullif(trim(coalesce(v_submission.pending_title, '')), '') is null then
    raise exception 'COS pending title is required.' using errcode = '22023';
  end if;

  if v_submission.file_size is null or v_submission.file_size <= 0 then
    raise exception 'COS file size is required.' using errcode = '22023';
  end if;

  if v_submission.mime_type not in ('video/mp4', 'video/webm') then
    raise exception 'Unsupported COS mime type.' using errcode = '22023';
  end if;

  select nullif(trim(p.username), '')
  into v_author_name
  from public.profiles p
  where p.id = v_submission.user_id;

  insert into public.videos (
    id,
    submission_id,
    platform,
    storage_provider,
    source_url,
    embed_url,
    playback_ref,
    title,
    cover_url,
    description,
    author_name,
    author_avatar,
    view_count,
    like_count,
    category_id,
    submitted_by,
    published_at
  )
  values (
    p_video_id,
    v_submission.id,
    'cos',
    'cos',
    null,
    null,
    p_playback_ref,
    trim(v_submission.pending_title),
    p_cover_url,
    nullif(trim(coalesce(v_submission.pending_description, '')), ''),
    coalesce(v_author_name, '原创投稿'),
    null,
    0,
    0,
    p_category_id,
    v_submission.user_id,
    now()
  );

  insert into public.video_tags (video_id, tag_id)
  select p_video_id, tag_id
  from unnest(v_tag_ids) as selected(tag_id);

  insert into public.video_tones (video_id, tone_id)
  select p_video_id, tone_id
  from unnest(v_tone_ids) as selected(tone_id);

  update public.submissions
  set
    status = 'approved',
    reviewed_by = v_reviewer_id,
    reviewed_at = now(),
    review_note = nullif(trim(coalesce(p_review_note, '')), '')
  where id = v_submission.id;

  return p_video_id;
end;
$$;

revoke all on function public.approve_cos_submission(uuid, uuid, uuid, text, text, uuid[], uuid[], text) from public;
revoke all on function public.approve_cos_submission(uuid, uuid, uuid, text, text, uuid[], uuid[], text) from anon;
grant execute on function public.approve_cos_submission(uuid, uuid, uuid, text, text, uuid[], uuid[], text) to authenticated;

create or replace function private.assert_palette_admin()
returns void
language plpgsql stable security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin = true) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.normalize_video_palette(p_palette jsonb)
returns jsonb
language plpgsql immutable security invoker
set search_path = ''
as $$
declare
  entry jsonb;
  normalized jsonb := '[]'::jsonb;
  hex text;
  percentage numeric;
begin
  if p_palette is null or jsonb_typeof(p_palette) is distinct from 'array' then
    raise exception 'Palette must be an array.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_palette) > 5 then
    raise exception 'Select at most 5 colors.' using errcode = '22023';
  end if;
  for entry in select value from jsonb_array_elements(p_palette) loop
    if jsonb_typeof(entry) is distinct from 'object' or jsonb_typeof(entry -> 'hex') is distinct from 'string' then
      raise exception 'Each palette color must contain a HEX string.' using errcode = '22023';
    end if;
    hex := public.normalize_color_hex(entry ->> 'hex');
    if exists (select 1 from jsonb_array_elements(normalized) color where color ->> 'hex' = hex) then
      raise exception 'Palette colors must be distinct.' using errcode = '22023';
    end if;
    percentage := null;
    if entry ? 'percentage' and entry -> 'percentage' <> 'null'::jsonb then
      if jsonb_typeof(entry -> 'percentage') is distinct from 'number' then
        raise exception 'Color percentage must be numeric or null.' using errcode = '22023';
      end if;
      percentage := (entry ->> 'percentage')::numeric;
      if percentage < 0 or percentage > 1 then
        raise exception 'Color percentage must be between 0 and 1.' using errcode = '22023';
      end if;
    end if;
    normalized := normalized || jsonb_build_array(jsonb_build_object('hex', hex, 'percentage', percentage));
  end loop;
  return normalized;
end;
$$;

create or replace function private.resolve_palette_tones(p_palette jsonb)
returns uuid[]
language plpgsql security invoker
set search_path = ''
as $$
declare
  palette jsonb;
  hex text;
  ids uuid[];
begin
  -- Guard before creating even one shared dictionary entry.
  perform private.assert_palette_admin();
  palette := private.normalize_video_palette(p_palette);
  -- Same lock order across publishers, even when they choose reversed palettes.
  for hex in select color ->> 'hex' from jsonb_array_elements(palette) color order by color ->> 'hex' loop
    if exists (select 1 from public.tones where color_hex = hex) then continue; end if;
    if exists (select 1 from public.tones where name = hex and color_hex <> hex) then
      raise exception 'A tone named % already has a different HEX color. Rename it before publishing.', hex using errcode = '23505';
    end if;
    insert into public.tones(name, color_hex) values (hex, hex)
    on conflict (color_hex) do update set color_hex = excluded.color_hex;
  end loop;
  select coalesce(array_agg(t.id order by color.position), array[]::uuid[])
  into ids
  from jsonb_array_elements(palette) with ordinality color(value, position)
  join public.tones t on t.color_hex = color.value ->> 'hex';
  return ids;
end;
$$;

create or replace function public.approve_submission_with_palette(
  p_submission_id uuid,
  p_category_id uuid,
  p_tag_ids uuid[] default array[]::uuid[],
  p_palette jsonb default '[]'::jsonb,
  p_review_note text default null
)
returns uuid
language plpgsql security invoker
set search_path = ''
as $$
declare
  palette jsonb;
  tone_ids uuid[];
  v_palette_video_id uuid;
begin
  perform private.assert_palette_admin();
  palette := private.normalize_video_palette(p_palette);
  tone_ids := private.resolve_palette_tones(palette);
  v_palette_video_id := public.approve_submission(p_submission_id, p_category_id, p_tag_ids, tone_ids, p_review_note);
  update public.video_tones vt
  set percentage = (color.value ->> 'percentage')::numeric,
      sort_order = (color.position - 1)::integer
  from jsonb_array_elements(palette) with ordinality color(value, position)
  join public.tones t on t.color_hex = color.value ->> 'hex'
  where vt.video_id = v_palette_video_id and vt.tone_id = t.id;
  return v_palette_video_id;
end;
$$;

create or replace function public.approve_cos_submission_with_palette(
  p_submission_id uuid,
  p_video_id uuid,
  p_category_id uuid,
  p_playback_ref text,
  p_cover_url text,
  p_tag_ids uuid[] default array[]::uuid[],
  p_palette jsonb default '[]'::jsonb,
  p_review_note text default null
)
returns uuid
language plpgsql security invoker
set search_path = ''
as $$
declare
  palette jsonb;
  tone_ids uuid[];
  v_palette_video_id uuid;
begin
  perform private.assert_palette_admin();
  palette := private.normalize_video_palette(p_palette);
  tone_ids := private.resolve_palette_tones(palette);
  v_palette_video_id := public.approve_cos_submission(p_submission_id, p_video_id, p_category_id, p_playback_ref, p_cover_url, p_tag_ids, tone_ids, p_review_note);
  update public.video_tones vt
  set percentage = (color.value ->> 'percentage')::numeric,
      sort_order = (color.position - 1)::integer
  from jsonb_array_elements(palette) with ordinality color(value, position)
  join public.tones t on t.color_hex = color.value ->> 'hex'
  where vt.video_id = v_palette_video_id and vt.tone_id = t.id;
  return v_palette_video_id;
end;
$$;

grant usage on schema private to authenticated;
revoke all on function private.assert_palette_admin(), private.normalize_video_palette(jsonb), private.resolve_palette_tones(jsonb) from public, anon;
grant execute on function private.assert_palette_admin(), private.normalize_video_palette(jsonb), private.resolve_palette_tones(jsonb) to authenticated;
revoke all on function public.approve_submission_with_palette(uuid, uuid, uuid[], jsonb, text) from public, anon;
revoke all on function public.approve_cos_submission_with_palette(uuid, uuid, uuid, text, text, uuid[], jsonb, text) from public, anon;
grant execute on function public.approve_submission_with_palette(uuid, uuid, uuid[], jsonb, text) to authenticated;
grant execute on function public.approve_cos_submission_with_palette(uuid, uuid, uuid, text, text, uuid[], jsonb, text) to authenticated;

create or replace function public.get_archive_videos_by_color(
  p_category_id uuid default null,
  p_tag_ids uuid[] default array[]::uuid[],
  p_color_group_keys text[] default array[]::text[],
  p_colors jsonb default '[]'::jsonb,
  p_color_match_mode text default 'any',
  p_limit integer default 24,
  p_offset integer default 0
)
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  colors jsonb := '[]'::jsonb;
  entry jsonb;
  precision_value numeric;
  group_keys text[] := coalesce(p_color_group_keys, array[]::text[]);
  result jsonb;
begin
  if p_color_match_mode is null or p_color_match_mode not in ('any', 'all') then
    raise exception 'Color match mode must be any or all.' using errcode = '22023';
  end if;
  if cardinality(group_keys) > 10 or exists (
    select 1 from unnest(group_keys) key where key is null or key not in ('red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink', 'brown', 'neutral')
  ) then
    raise exception 'Unknown color group.' using errcode = '22023';
  end if;
  if p_colors is null or jsonb_typeof(p_colors) is distinct from 'array' then
    raise exception 'Colors must be an array.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_colors) > 3 then
    raise exception 'Select at most 3 filter colors.' using errcode = '22023';
  end if;
  for entry in select value from jsonb_array_elements(p_colors) loop
    if jsonb_typeof(entry) is distinct from 'object' or jsonb_typeof(entry -> 'hex') is distinct from 'string' then
      raise exception 'Each filter color must contain a HEX string.' using errcode = '22023';
    end if;
    precision_value := 30;
    if entry ? 'precision' then
      if jsonb_typeof(entry -> 'precision') is distinct from 'number' then
        raise exception 'Color precision must be an integer from 1 to 100.' using errcode = '22023';
      end if;
      precision_value := (entry ->> 'precision')::numeric;
      if precision_value < 1 or precision_value > 100 or precision_value <> trunc(precision_value) then
        raise exception 'Color precision must be an integer from 1 to 100.' using errcode = '22023';
      end if;
    end if;
    colors := colors || jsonb_build_array(jsonb_build_object('hex', public.normalize_color_hex(entry ->> 'hex'), 'precision', precision_value));
  end loop;

  with args as (
    select greatest(1, least(coalesce(p_limit, 24), 48)) as page_limit,
           least(greatest(0, coalesce(p_offset, 0)), 11976) as page_offset,
           (coalesce(p_tag_ids, array[]::uuid[]))[1:10] as tag_ids
  ),
  targets as materialized (
    select color ->> 'hex' as hex, (100 - (color ->> 'precision')::integer)::double precision as threshold
    from jsonb_array_elements(colors) color
  ),
  filtered_ids as materialized (
    select v.id, v.published_at
    from public.videos v cross join args
    where v.published_at is not null
      and (p_category_id is null or v.category_id = p_category_id)
      and (cardinality(args.tag_ids) = 0 or exists (
        select 1 from public.video_tags vt where vt.video_id = v.id and vt.tag_id = any(args.tag_ids)
      ))
      and (cardinality(group_keys) = 0 or exists (
        select 1 from public.video_tones vt join public.tones t on t.id = vt.tone_id
        where vt.video_id = v.id and public.tone_color_group(t.color_hex) = any(group_keys)
      ))
      and (jsonb_array_length(colors) = 0 or
        (p_color_match_mode = 'any' and exists (
          select 1 from public.video_tones vt join public.tones t on t.id = vt.tone_id cross join targets
          where vt.video_id = v.id and public.color_weighted_rgb_distance(t.color_hex, targets.hex) <= targets.threshold
        )) or
        (p_color_match_mode = 'all' and not exists (
          select 1 from targets where not exists (
            select 1 from public.video_tones vt join public.tones t on t.id = vt.tone_id
            where vt.video_id = v.id and public.color_weighted_rgb_distance(t.color_hex, targets.hex) <= targets.threshold
          )
        ))
      )
  ),
  total as (select count(*) as total_count from filtered_ids),
  paged_ids as (
    select filtered_ids.id, filtered_ids.published_at from filtered_ids
    order by filtered_ids.published_at desc, filtered_ids.id desc
    limit (select page_limit from args) offset (select page_offset from args)
  ),
  paged as (
    select v.id, v.platform, v.storage_provider, v.source_url, v.embed_url, v.playback_ref,
           v.title, v.cover_url, v.description, v.author_name, v.author_avatar, v.view_count,
           v.like_count, v.category_id, v.published_at, v.created_at
    from paged_ids join public.videos v on v.id = paged_ids.id
  )
  select jsonb_build_object('total_count', total.total_count, 'items', coalesce(
    (select jsonb_agg(to_jsonb(paged) order by paged.published_at desc, paged.id desc) from paged), '[]'::jsonb
  )) into result from total;
  return result;
end;
$$;

revoke all on function public.get_archive_videos_by_color(uuid, uuid[], text[], jsonb, text, integer, integer) from public;
grant execute on function public.get_archive_videos_by_color(uuid, uuid[], text[], jsonb, text, integer, integer) to anon, authenticated;

-- Existing RLS remains effective; explicitly enable it on both changed tables.
alter table public.tones enable row level security;
alter table public.video_tones enable row level security;

commit;
