-- Run with Supabase apply_migration on the dev project only after verification.
-- The publish notification trigger is restored in the same transaction.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '90s';
lock table public.videos in share row exclusive mode;
do $preflight$
begin
  if (select count(*) from public.submissions
      where auto_fetched_meta->'pvdex'->>'sourceSha256'='__SOURCE_SHA256__') <> __EXPECTED_RECORDS__ then
    raise exception 'PVDex snapshot is incomplete';
  end if;
  if (select count(*) from public.push_broadcasts) <> __EXPECTED_PUSH_BROADCAST_COUNT__ then
    raise exception 'Unexpected notification queue change';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.videos'::regclass
      and tgname='enqueue_video_publish_broadcast' and tgenabled='O') then
    raise exception 'Publish trigger state differs from the pre-import state';
  end if;
end $preflight$;
alter table public.videos disable trigger enqueue_video_publish_broadcast;
update public.videos v set published_at=(s.auto_fetched_meta->'pvdex'->>'publishedAt')::timestamptz
from public.submissions s
where v.submission_id=s.id and v.published_at is null
  and s.auto_fetched_meta->'pvdex'->>'sourceSha256'='__SOURCE_SHA256__';
alter table public.videos enable trigger enqueue_video_publish_broadcast;
do $postflight$
begin
  if exists(select 1 from public.videos v join public.submissions s on s.id=v.submission_id
    where s.auto_fetched_meta->'pvdex'->>'sourceSha256'='__SOURCE_SHA256__' and v.published_at is null) then
    raise exception 'PVDex publish dates are incomplete';
  end if;
  if (select count(*) from public.push_broadcasts) <> __EXPECTED_PUSH_BROADCAST_COUNT__ then
    raise exception 'Import must not enqueue notifications';
  end if;
end $postflight$;
commit;
