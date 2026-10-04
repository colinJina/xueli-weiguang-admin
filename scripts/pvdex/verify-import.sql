-- Hash every original field and every selected relationship independently.
select s.platform || ':' || s.external_id as key, v.id as video_id, s.status,
  c.name as category, v.source_url, v.embed_url, v.published_at,
  md5(concat_ws(chr(31),
    coalesce(o.record->>'id',''),coalesce(o.record->>'bvid',''),coalesce(o.record->>'title',''),
    coalesce(o.record->>'cover',''),coalesce(o.record->>'author',''),coalesce(o.record->>'views',''),
    coalesce(o.record->>'tags',''),coalesce(o.record->>'metrics',''),coalesce(o.record->>'createdAt',''),
    coalesce((select string_agg(concat_ws(chr(31),
      coalesce(color->>'id',''),coalesce(color->>'videoId',''),coalesce(color->>'hex',''),
      coalesce(color->>'percentage',''),coalesce(color->>'order','')),chr(30) order by position)
      from jsonb_array_elements(o.record->'colors') with ordinality as raw(color,position)),''))) as original_hash,
  (select md5(coalesce(string_agg(t.name,chr(31) order by t.name collate "C"),''))
    from public.video_tags vt join public.tags t on t.id=vt.tag_id where vt.video_id=v.id) as tags_hash,
  (select md5(coalesce(string_agg(concat_ws(chr(31),t.color_hex,vt.percentage::text,vt.sort_order::text),
      chr(30) order by vt.sort_order),'')) from public.video_tones vt join public.tones t on t.id=vt.tone_id
    where vt.video_id=v.id) as colors_hash
from public.submissions s
join public.videos v on v.submission_id=s.id
join public.categories c on c.id=v.category_id
cross join lateral (select s.auto_fetched_meta->'pvdex'->'original' as record) o
where s.auto_fetched_meta->'pvdex'->>'sourceSha256'='__SOURCE_SHA256__'
order by s.platform,s.external_id;
