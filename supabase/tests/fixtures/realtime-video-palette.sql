-- Disposable test foundation only. Never apply this file to an existing database.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema private;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create table public.profiles(id uuid primary key, username text, is_admin boolean not null default false);
create table public.categories(id uuid primary key default gen_random_uuid(), name text unique not null, sort_order integer default 0);
create table public.tags(id uuid primary key default gen_random_uuid(), name text unique not null);
create table public.tone_families(
  id uuid primary key default gen_random_uuid(), key text unique not null, name text unique not null,
  color_hex text not null, sort_order integer not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.tones(
  id uuid primary key default gen_random_uuid(), name text unique not null,
  color_hex text not null default '#D4D4D4',
  family_id uuid not null constraint tones_family_id_fkey references public.tone_families(id),
  created_at timestamptz not null default now()
);
create index idx_tones_family_id_id on public.tones(family_id, id);
create table public.submissions(
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles,
  platform text not null, storage_provider text not null, source_url text, external_id text,
  source_ref text, cover_ref text, pending_title text, pending_description text, file_size bigint, mime_type text,
  status text not null default 'pending', auto_fetched_meta jsonb not null default '{}'::jsonb,
  fetched_at timestamptz, fetch_error text, reviewed_by uuid references public.profiles,
  review_note text, reviewed_at timestamptz, created_at timestamptz not null default now()
);
create table public.videos(
  id uuid primary key default gen_random_uuid(), submission_id uuid not null unique references public.submissions,
  platform text not null, storage_provider text not null, source_url text, embed_url text, playback_ref text,
  title text not null, cover_url text, description text, author_name text, author_avatar text,
  view_count bigint not null default 0, like_count bigint not null default 0,
  category_id uuid not null references public.categories, submitted_by uuid references public.profiles,
  published_at timestamptz, created_at timestamptz not null default now()
);
create table public.video_tags(video_id uuid references public.videos, tag_id uuid references public.tags, primary key(video_id,tag_id));
create table public.video_tones(video_id uuid references public.videos, tone_id uuid references public.tones, primary key(video_id,tone_id));

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.tags enable row level security;
alter table public.tones enable row level security;
alter table public.submissions enable row level security;
alter table public.videos enable row level security;
alter table public.video_tags enable row level security;
alter table public.video_tones enable row level security;
alter table public.tone_families enable row level security;
create policy profiles_self_read on public.profiles for select to authenticated using (id = auth.uid());
grant select on public.profiles to authenticated;
grant select on public.submissions to authenticated;
create policy tone_families_public_read on public.tone_families for select to anon,authenticated using(true);
create policy tone_families_admin_insert on public.tone_families for insert to authenticated with check(exists(select 1 from public.profiles where id=auth.uid() and is_admin=true));
create policy tone_families_admin_update on public.tone_families for update to authenticated using(exists(select 1 from public.profiles where id=auth.uid() and is_admin=true)) with check(exists(select 1 from public.profiles where id=auth.uid() and is_admin=true));
create policy tone_families_admin_delete on public.tone_families for delete to authenticated using(exists(select 1 from public.profiles where id=auth.uid() and is_admin=true));
grant select on public.tone_families to anon,authenticated;
grant insert,update,delete on public.tone_families to authenticated;

insert into public.profiles(id, username, is_admin) values
('00000000-0000-0000-0000-000000000001','管理员',true),
('00000000-0000-0000-0000-000000000002','投稿者',false);
insert into public.categories(id,name) values('10000000-0000-0000-0000-000000000001','测试分类');
insert into public.tone_families(id,key,name,color_hex) values('20000000-0000-0000-0000-000000000001','red','红','#EF4444');
insert into public.tones(id,name,color_hex,family_id) values
('30000000-0000-0000-0000-000000000001','历史红','#ff0000','20000000-0000-0000-0000-000000000001'),
('30000000-0000-0000-0000-000000000002','历史蓝','#0000ff','20000000-0000-0000-0000-000000000001');
insert into public.submissions(id,user_id,platform,storage_provider)
values('40000000-0000-0000-0000-000000000099','00000000-0000-0000-0000-000000000002','bilibili','bilibili');
insert into public.videos(id,submission_id,platform,storage_provider,title,category_id)
values('50000000-0000-0000-0000-000000000099','40000000-0000-0000-0000-000000000099','bilibili','bilibili','历史未发布视频','10000000-0000-0000-0000-000000000001');
insert into public.video_tones(video_id,tone_id) values
('50000000-0000-0000-0000-000000000099','30000000-0000-0000-0000-000000000002'),
('50000000-0000-0000-0000-000000000099','30000000-0000-0000-0000-000000000001');

create function public.get_archive_videos(
  p_category_id uuid default null,p_tag_ids uuid[] default '{}',p_tone_family_keys text[] default '{}',
  p_limit integer default 24,p_offset integer default 0
) returns jsonb language sql security invoker as $$
  select jsonb_build_object('items', '[]'::jsonb, 'total_count', count(*)) from public.tone_families;
$$;
