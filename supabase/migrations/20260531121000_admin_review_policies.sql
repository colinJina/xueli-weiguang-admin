do $$
declare
  admin_check text := 'exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true)';
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'submissions' and policyname = 'submissions_admin_select_all') then
    execute 'create policy submissions_admin_select_all on public.submissions for select to authenticated using (' || admin_check || ')';
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'submissions' and policyname = 'submissions_admin_update_all') then
    execute 'create policy submissions_admin_update_all on public.submissions for update to authenticated using (' || admin_check || ') with check (' || admin_check || ')';
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'categories' and policyname = 'categories_admin_all') then
    execute 'create policy categories_admin_all on public.categories for all to authenticated using (' || admin_check || ') with check (' || admin_check || ')';
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tags' and policyname = 'tags_admin_all') then
    execute 'create policy tags_admin_all on public.tags for all to authenticated using (' || admin_check || ') with check (' || admin_check || ')';
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tones' and policyname = 'tones_admin_all') then
    execute 'create policy tones_admin_all on public.tones for all to authenticated using (' || admin_check || ') with check (' || admin_check || ')';
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'videos' and policyname = 'videos_admin_all') then
    execute 'create policy videos_admin_all on public.videos for all to authenticated using (' || admin_check || ') with check (' || admin_check || ')';
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'video_tags' and policyname = 'video_tags_admin_all') then
    execute 'create policy video_tags_admin_all on public.video_tags for all to authenticated using (' || admin_check || ') with check (' || admin_check || ')';
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'video_tones' and policyname = 'video_tones_admin_all') then
    execute 'create policy video_tones_admin_all on public.video_tones for all to authenticated using (' || admin_check || ') with check (' || admin_check || ')';
  end if;
end $$;

grant update on public.submissions to authenticated;
grant insert, update, delete on public.categories to authenticated;
grant insert, update, delete on public.tags to authenticated;
grant insert, update, delete on public.tones to authenticated;
grant insert, update, delete on public.videos to authenticated;
grant insert, update, delete on public.video_tags to authenticated;
grant insert, update, delete on public.video_tones to authenticated;
