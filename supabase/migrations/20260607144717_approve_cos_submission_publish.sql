begin;

alter table public.submissions
  add column if not exists storage_provider text,
  add column if not exists source_ref text,
  add column if not exists cover_ref text,
  add column if not exists pending_title text,
  add column if not exists pending_description text,
  add column if not exists file_size bigint,
  add column if not exists mime_type text,
  add column if not exists source_etag text,
  add column if not exists cover_etag text;

update public.submissions
set storage_provider = platform
where storage_provider is null;

alter table public.submissions
  alter column storage_provider set default 'bilibili',
  alter column storage_provider set not null,
  alter column source_url drop not null;

alter table public.submissions
  drop constraint if exists submissions_platform_check,
  drop constraint if exists submissions_storage_provider_check,
  drop constraint if exists submissions_bilibili_source_check,
  drop constraint if exists submissions_cos_source_check,
  add constraint submissions_platform_check
    check (platform in ('bilibili', 'cos')),
  add constraint submissions_storage_provider_check
    check (storage_provider in ('bilibili', 'cos')),
  add constraint submissions_bilibili_source_check
    check (
      storage_provider <> 'bilibili'
      or (platform = 'bilibili' and source_url is not null and external_id is not null)
    ),
  add constraint submissions_cos_source_check
    check (
      storage_provider <> 'cos'
      or (
        platform = 'cos'
        and source_ref is not null
        and cover_ref is not null
        and pending_title is not null
        and char_length(trim(pending_title)) between 1 and 80
        and (pending_description is null or char_length(pending_description) <= 500)
        and file_size is not null
        and file_size > 0
        and file_size <= 52428800
        and mime_type in ('video/mp4', 'video/webm')
        and source_etag is not null
        and cover_etag is not null
      )
    );

create unique index if not exists idx_submissions_storage_provider_source_ref_unique
  on public.submissions (storage_provider, source_ref)
  where source_ref is not null;

create index if not exists idx_submissions_storage_provider_status_created_at
  on public.submissions (storage_provider, status, created_at desc);

alter table public.videos
  add column if not exists storage_provider text,
  add column if not exists playback_ref text;

update public.videos
set storage_provider = platform
where storage_provider is null;

alter table public.videos
  alter column storage_provider set default 'bilibili',
  alter column storage_provider set not null,
  alter column source_url drop not null,
  alter column embed_url drop not null;

alter table public.videos
  drop constraint if exists videos_platform_check,
  drop constraint if exists videos_storage_provider_check,
  drop constraint if exists videos_bilibili_source_check,
  drop constraint if exists videos_cos_playback_check,
  add constraint videos_platform_check
    check (platform in ('bilibili', 'cos')),
  add constraint videos_storage_provider_check
    check (storage_provider in ('bilibili', 'cos')),
  add constraint videos_bilibili_source_check
    check (
      storage_provider <> 'bilibili'
      or (platform = 'bilibili' and source_url is not null and embed_url is not null)
    ),
  add constraint videos_cos_playback_check
    check (
      storage_provider <> 'cos'
      or (platform = 'cos' and playback_ref is not null)
    );

create unique index if not exists idx_videos_storage_provider_playback_ref_unique
  on public.videos (storage_provider, playback_ref)
  where playback_ref is not null;

create index if not exists idx_videos_storage_provider_published_at
  on public.videos (storage_provider, published_at desc);

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

commit;
