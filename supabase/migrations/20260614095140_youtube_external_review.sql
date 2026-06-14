begin;

do $$
begin
  if exists (
    select 1
    from public.submissions
    where platform in ('bilibili', 'youtube')
      and external_id is not null
    group by platform, external_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate external submissions exist for (platform, external_id).';
  end if;
end;
$$;

alter table public.submissions
  drop constraint if exists submissions_platform_check,
  drop constraint if exists submissions_storage_provider_check,
  drop constraint if exists submissions_bilibili_source_check,
  drop constraint if exists submissions_youtube_source_check,
  drop constraint if exists submissions_external_source_check,
  add constraint submissions_platform_check
    check (platform in ('bilibili', 'youtube', 'cos')),
  add constraint submissions_storage_provider_check
    check (storage_provider in ('bilibili', 'youtube', 'cos')),
  add constraint submissions_external_source_check
    check (
      storage_provider not in ('bilibili', 'youtube')
      or (
        platform = storage_provider
        and nullif(trim(coalesce(source_url, '')), '') is not null
        and external_id is not null
        and nullif(trim(external_id), '') is not null
      )
    );

alter table public.videos
  drop constraint if exists videos_platform_check,
  drop constraint if exists videos_storage_provider_check,
  drop constraint if exists videos_bilibili_source_check,
  drop constraint if exists videos_youtube_source_check,
  drop constraint if exists videos_external_source_check,
  add constraint videos_platform_check
    check (platform in ('bilibili', 'youtube', 'cos')),
  add constraint videos_storage_provider_check
    check (storage_provider in ('bilibili', 'youtube', 'cos')),
  add constraint videos_external_source_check
    check (
      storage_provider not in ('bilibili', 'youtube')
      or (
        platform = storage_provider
        and nullif(trim(coalesce(source_url, '')), '') is not null
        and embed_url is not null
      )
    );

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

  if cardinality(v_tone_ids) > 3 then
    raise exception 'Select at most 3 tones.' using errcode = '22023';
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
    now()
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

commit;
