begin;

grant delete on table public.home_hero_features to authenticated;

do $$
declare
  admin_check text := 'exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true)';
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'home_hero_features'
      and policyname = 'home_hero_features_admin_delete_all'
  ) then
    execute 'create policy home_hero_features_admin_delete_all on public.home_hero_features for delete to authenticated using (' || admin_check || ')';
  end if;
end $$;

create or replace function public.delete_published_video(p_video_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_reviewer_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_video public.videos%rowtype;
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

  if p_video_id is null then
    raise exception 'Video id is required.' using errcode = '22023';
  end if;

  select *
  into v_video
  from public.videos
  where id = p_video_id
  for update;

  if not found then
    raise exception 'Published video not found.' using errcode = 'P0002';
  end if;

  update public.home_hero_feature_requests
  set status = 'rejected'
  where submission_id = v_video.submission_id
    and status in ('pending', 'applied');

  delete from public.home_hero_features
  where video_id = p_video_id;

  delete from public.video_tags
  where video_id = p_video_id;

  delete from public.video_tones
  where video_id = p_video_id;

  delete from public.videos
  where id = p_video_id;

  return p_video_id;
end;
$$;

revoke all on function public.delete_published_video(uuid) from public;
revoke all on function public.delete_published_video(uuid) from anon;
revoke all on function public.delete_published_video(uuid) from authenticated;
grant execute on function public.delete_published_video(uuid) to authenticated;

commit;
