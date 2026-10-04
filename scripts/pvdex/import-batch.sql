begin;
set local lock_timeout = '10s';
set local statement_timeout = '90s';
-- Ordinary constraints and RLS policies remain installed; this is a DBA import.
do $pvdex_import$
declare
  payload jsonb := __PAYLOAD__;
  record jsonb;
  color jsonb;
  tag_name text;
  dictionary_id uuid;
  v_category_id uuid;
  v_actor_id uuid;
  v_submission_id uuid;
  v_video_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('pvdex-dev-catalog-import'));
  select id into v_actor_id from public.profiles where is_admin order by created_at desc limit 1;
  if v_actor_id is null then raise exception 'Existing dev admin required'; end if;
  for record in select value from jsonb_array_elements(payload->'records') loop
    insert into public.categories(name) values (record->>'category') on conflict(name) do nothing;
    select id into strict v_category_id from public.categories where name=record->>'category';
    insert into public.tags(name) select value from jsonb_array_elements_text(record->'allTags')
      on conflict(name) do nothing;
    insert into public.tones(name,color_hex)
      select case when exists(select 1 from public.tones t where t.name=c->>'hex' and t.color_hex<>c->>'hex')
        then 'PVDex ' || (c->>'hex') else c->>'hex' end, c->>'hex'
      from jsonb_array_elements(record->'allColors') c on conflict(color_hex) do nothing;

    select s.id into v_submission_id from public.submissions s
      where s.platform=record->>'platform' and s.external_id=record->>'externalId' for update;
    if v_submission_id is null then
      insert into public.submissions(user_id,platform,storage_provider,source_url,external_id,status,
        auto_fetched_meta,fetched_at,reviewed_by,reviewed_at,review_note,created_at)
      values(v_actor_id,record->>'platform',record->>'platform',record->>'sourceUrl',record->>'externalId','approved',
        jsonb_build_object('title',record->>'title','pic',record->>'coverUrl','desc','',
          'ownerName',record->>'authorName','ownerAvatar','','viewCount',(record->>'viewCount')::bigint,
          'likeCount',0,'duration',0,'pubdate',extract(epoch from (record->>'publishedAt')::timestamptz),
          'pvdex',jsonb_build_object('source','https://pvdex.flux-ion.cn/api/videos',
            'importedAt',payload->>'importedAt','sourceSha256',payload->>'sourceSha256',
            'publishedAt',record->>'publishedAt','original',record->'original')),
        (payload->>'importedAt')::timestamptz,v_actor_id,(payload->>'importedAt')::timestamptz,
        'PVDex test catalog import; original tags, metrics and colors preserved in auto_fetched_meta.pvdex.original.',
        (record->>'createdAt')::timestamptz) returning id into v_submission_id;
    else
      -- Keep the cached platform metadata when the video already existed.
      update public.submissions s set status='approved',fetch_error=null,
        fetched_at=coalesce(s.fetched_at,(payload->>'importedAt')::timestamptz),
        reviewed_by=coalesce(s.reviewed_by,v_actor_id),
        reviewed_at=coalesce(s.reviewed_at,(payload->>'importedAt')::timestamptz),
        auto_fetched_meta=s.auto_fetched_meta || jsonb_build_object('pvdex',
          jsonb_build_object('source','https://pvdex.flux-ion.cn/api/videos',
            'importedAt',payload->>'importedAt','sourceSha256',payload->>'sourceSha256',
            'publishedAt',record->>'publishedAt','original',record->'original'))
      where s.id=v_submission_id;
    end if;

    select v.id into v_video_id from public.videos v where v.submission_id=v_submission_id for update;
    if v_video_id is null then
      -- Publish dates are finalized together after all batches have been verified.
      -- A NULL date prevents the publish trigger from enqueueing notifications.
      insert into public.videos(submission_id,platform,storage_provider,source_url,embed_url,title,
        cover_url,description,author_name,author_avatar,view_count,like_count,category_id,
        submitted_by,published_at,created_at)
      values(v_submission_id,record->>'platform',record->>'platform',record->>'sourceUrl',record->>'embedUrl',
        record->>'title',record->>'coverUrl','',record->>'authorName','',(record->>'viewCount')::bigint,0,
        v_category_id,v_actor_id,null,(record->>'createdAt')::timestamptz) returning id into v_video_id;
    else
      update public.videos v set category_id=v_category_id where v.id=v_video_id;
    end if;
    delete from public.video_tags vt where vt.video_id=v_video_id;
    for tag_name in select value from jsonb_array_elements_text(record->'tags') loop
      select t.id into strict dictionary_id from public.tags t where t.name=tag_name;
      insert into public.video_tags(video_id,tag_id) values(v_video_id,dictionary_id);
    end loop;
    delete from public.video_tones vt where vt.video_id=v_video_id;
    for color in select value from jsonb_array_elements(record->'colors') loop
      select t.id into strict dictionary_id from public.tones t where t.color_hex=color->>'hex';
      insert into public.video_tones(video_id,tone_id,percentage,sort_order)
        values(v_video_id,dictionary_id,(color->>'percentage')::numeric,(color->>'sortOrder')::integer);
    end loop;
  end loop;
end;
$pvdex_import$;
commit;
