begin;

grant select, update on table public.home_hero_feature_requests to authenticated;
grant select, insert, update on table public.home_hero_features to authenticated;

do $$
declare
  admin_check text := 'exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true)';
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'home_hero_feature_requests'
      and policyname = 'home_hero_feature_requests_admin_select_all'
  ) then
    execute 'create policy home_hero_feature_requests_admin_select_all on public.home_hero_feature_requests for select to authenticated using (' || admin_check || ')';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'home_hero_feature_requests'
      and policyname = 'home_hero_feature_requests_admin_update_all'
  ) then
    execute 'create policy home_hero_feature_requests_admin_update_all on public.home_hero_feature_requests for update to authenticated using (' || admin_check || ') with check (' || admin_check || ')';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'home_hero_features'
      and policyname = 'home_hero_features_admin_select_all'
  ) then
    execute 'create policy home_hero_features_admin_select_all on public.home_hero_features for select to authenticated using (' || admin_check || ')';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'home_hero_features'
      and policyname = 'home_hero_features_admin_insert_all'
  ) then
    execute 'create policy home_hero_features_admin_insert_all on public.home_hero_features for insert to authenticated with check (' || admin_check || ')';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'home_hero_features'
      and policyname = 'home_hero_features_admin_update_all'
  ) then
    execute 'create policy home_hero_features_admin_update_all on public.home_hero_features for update to authenticated using (' || admin_check || ') with check (' || admin_check || ')';
  end if;
end $$;

create or replace function public.apply_home_hero_feature_request(
  p_submission_id uuid,
  p_focal_x numeric default 0.5,
  p_focal_y numeric default 0.5,
  p_overlay_strength numeric default 0.62
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_reviewer_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_request_status text;
  v_submission public.submissions%rowtype;
  v_video public.videos%rowtype;
  v_feature_id uuid;
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

  if p_focal_x is null or p_focal_x < 0 or p_focal_x > 1 then
    raise exception 'Focal x must be between 0 and 1.' using errcode = '22023';
  end if;

  if p_focal_y is null or p_focal_y < 0 or p_focal_y > 1 then
    raise exception 'Focal y must be between 0 and 1.' using errcode = '22023';
  end if;

  if p_overlay_strength is null or p_overlay_strength < 0.4 or p_overlay_strength > 0.8 then
    raise exception 'Overlay strength must be between 0.4 and 0.8.' using errcode = '22023';
  end if;

  select status
  into v_request_status
  from public.home_hero_feature_requests
  where submission_id = p_submission_id
  for update;

  if not found then
    raise exception 'Home hero feature request not found.' using errcode = 'P0002';
  end if;

  if v_request_status = 'applied' then
    select id
    into v_feature_id
    from public.home_hero_features
    where source_submission_id = p_submission_id
    order by created_at desc
    limit 1;

    if v_feature_id is null then
      raise exception 'Applied home hero feature is missing.' using errcode = 'P0002';
    end if;

    return v_feature_id;
  end if;

  if v_request_status <> 'pending' then
    raise exception 'Only pending home hero feature requests can be applied.' using errcode = '22023';
  end if;

  select *
  into v_submission
  from public.submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception 'Submission not found.' using errcode = 'P0002';
  end if;

  if v_submission.status <> 'approved' then
    raise exception 'Submission must be approved before applying home hero feature.' using errcode = '22023';
  end if;

  select *
  into v_video
  from public.videos
  where submission_id = p_submission_id
  order by created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'Published video not found for submission.' using errcode = 'P0002';
  end if;

  if v_video.published_at is null then
    raise exception 'Video must be published before applying home hero feature.' using errcode = '22023';
  end if;

  if nullif(trim(coalesce(v_video.cover_url, '')), '') is null then
    raise exception 'Video cover url is required for home hero feature.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('home_hero_features_active')::bigint);

  update public.home_hero_features
  set is_active = false
  where is_active;

  insert into public.home_hero_features (
    video_id,
    source_submission_id,
    focal_x,
    focal_y,
    overlay_strength,
    is_active,
    created_by
  )
  values (
    v_video.id,
    v_submission.id,
    p_focal_x,
    p_focal_y,
    p_overlay_strength,
    true,
    v_reviewer_id
  )
  returning id into v_feature_id;

  update public.home_hero_feature_requests
  set status = 'applied'
  where submission_id = p_submission_id;

  return v_feature_id;
end;
$$;

create or replace function public.reject_home_hero_feature_request(
  p_submission_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_reviewer_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_request_status text;
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

  select status
  into v_request_status
  from public.home_hero_feature_requests
  where submission_id = p_submission_id
  for update;

  if not found then
    raise exception 'Home hero feature request not found.' using errcode = 'P0002';
  end if;

  if v_request_status <> 'pending' then
    raise exception 'Only pending home hero feature requests can be rejected.' using errcode = '22023';
  end if;

  update public.home_hero_feature_requests
  set status = 'rejected'
  where submission_id = p_submission_id;

  return p_submission_id;
end;
$$;

revoke all on function public.apply_home_hero_feature_request(uuid, numeric, numeric, numeric) from public;
revoke all on function public.apply_home_hero_feature_request(uuid, numeric, numeric, numeric) from anon;
revoke all on function public.apply_home_hero_feature_request(uuid, numeric, numeric, numeric) from authenticated;
grant execute on function public.apply_home_hero_feature_request(uuid, numeric, numeric, numeric) to authenticated;

revoke all on function public.reject_home_hero_feature_request(uuid) from public;
revoke all on function public.reject_home_hero_feature_request(uuid) from anon;
revoke all on function public.reject_home_hero_feature_request(uuid) from authenticated;
grant execute on function public.reject_home_hero_feature_request(uuid) to authenticated;

commit;
