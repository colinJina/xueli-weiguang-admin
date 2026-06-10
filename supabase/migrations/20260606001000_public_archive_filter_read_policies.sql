grant select on public.videos to anon, authenticated;
grant select on public.categories to anon, authenticated;
grant select on public.tags to anon, authenticated;
grant select on public.tones to anon, authenticated;
grant select on public.video_tags to anon, authenticated;
grant select on public.video_tones to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'videos'
      and policyname = 'videos_public_read_published'
  ) then
    execute $policy$
      create policy videos_public_read_published
      on public.videos
      for select
      to anon, authenticated
      using (published_at is not null)
    $policy$;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'categories'
      and policyname = 'categories_public_read'
  ) then
    execute $policy$
      create policy categories_public_read
      on public.categories
      for select
      to anon, authenticated
      using (true)
    $policy$;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tags'
      and policyname = 'tags_public_read'
  ) then
    execute $policy$
      create policy tags_public_read
      on public.tags
      for select
      to anon, authenticated
      using (true)
    $policy$;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tones'
      and policyname = 'tones_public_read'
  ) then
    execute $policy$
      create policy tones_public_read
      on public.tones
      for select
      to anon, authenticated
      using (true)
    $policy$;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'video_tags'
      and policyname = 'video_tags_public_read_published'
  ) then
    execute $policy$
      create policy video_tags_public_read_published
      on public.video_tags
      for select
      to anon, authenticated
      using (
        exists (
          select 1
          from public.videos v
          where v.id = video_tags.video_id
            and v.published_at is not null
        )
      )
    $policy$;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'video_tones'
      and policyname = 'video_tones_public_read_published'
  ) then
    execute $policy$
      create policy video_tones_public_read_published
      on public.video_tones
      for select
      to anon, authenticated
      using (
        exists (
          select 1
          from public.videos v
          where v.id = video_tones.video_id
            and v.published_at is not null
        )
      )
    $policy$;
  end if;
end $$;
