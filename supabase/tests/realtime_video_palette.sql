-- Plain PostgreSQL assertions: run only on a disposable fixture/local test DB.
-- Entire test transaction rolls back, including generated submissions and colors.
begin;
create function pg_temp.assert_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Assertion failed: %', label; end if; end;
$$;
create function pg_temp.expect_state(statement text, expected text, label text) returns void language plpgsql as $$
declare actual text;
begin
  begin execute statement;
  exception when others then
    get stacked diagnostics actual = returned_sqlstate;
    if actual <> expected then raise exception '%: expected %, got % (%)', label, expected, actual, sqlerrm; end if;
    return;
  end;
  raise exception '%: expected SQLSTATE %, but statement succeeded', label, expected;
end;
$$;
grant execute on function pg_temp.assert_true(boolean,text), pg_temp.expect_state(text,text,text) to anon,authenticated;

select pg_temp.assert_true(public.normalize_color_hex(' cf3030 ')='#CF3030','HEX normalization');
select pg_temp.expect_state($q$select public.normalize_color_hex('#XYZ123')$q$,'22023','invalid HEX');
select pg_temp.assert_true(public.tone_color_group(hex)=expected,'group: '||hex||' = '||expected)
from (values
  ('#FF0000','red'),('#FF4000','orange'),('#FFBF00','orange'),('#FFC000','yellow'),
  ('#BFFF00','green'),('#00FFBF','green'),('#00FFC0','cyan'),('#00BFFF','blue'),
  ('#4000FF','purple'),('#FF0040','purple'),('#FF003F','red'),
  ('#FF80BF','pink'),('#D2AE00','brown'),('#D2AF00','yellow'),
  ('#8C7373','neutral'),('#8D7272','red'),('#280000','neutral'),('#290000','red'),
  ('#FFFFE5','yellow'),('#FFFFE6','neutral'),('#808080','neutral'),('#FFFFFF','neutral'),('#000000','neutral')
) sample(hex,expected);
select pg_temp.assert_true(public.color_weighted_rgb_distance('#000000','#010101')=3,'weighted RGB formula');
select pg_temp.assert_true(public.color_weighted_rgb_distance('#CF3030','#cf3030')=0,'exact color match');
select pg_temp.assert_true((select color_hex from public.tones where id='30000000-0000-0000-0000-000000000001')='#FF0000','history uppercase');
select pg_temp.assert_true((select family_id from public.tones where id='30000000-0000-0000-0000-000000000001')='20000000-0000-0000-0000-000000000001','history family retained during expand');
select pg_temp.assert_true((select sort_order=0 and percentage is null from public.video_tones where video_id='50000000-0000-0000-0000-000000000099' and tone_id='30000000-0000-0000-0000-000000000001'),'stable historical order and unknown percentage');

-- Missing auth and ordinary users cannot create palette entries or approve.
set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.expect_state($q$select public.approve_submission_with_palette('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','{}','[{"hex":"#110011"}]')$q$,'42501','missing auth');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select pg_temp.expect_state($q$select public.approve_submission_with_palette('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','{}','[{"hex":"#110011"}]')$q$,'42501','nonadmin publishing');
select pg_temp.expect_state($q$insert into public.tones(name,color_hex) values ('denied','#110011')$q$,'42501','nonadmin tone insert');
select pg_temp.assert_true(not exists(select 1 from public.tones where color_hex='#110011'),'no unauthorized palette write');
reset role;

insert into public.submissions(id,user_id,platform,storage_provider,source_url,external_id,auto_fetched_meta,fetched_at)
select ('40000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000002','bilibili','bilibili','https://www.bilibili.com/video/BV1xx411c7mD','BV1xx411c7mD',
'{"title":"测试视频","pic":"https://example.com/cover.jpg","desc":"介绍","ownerName":"作者","ownerAvatar":"","viewCount":10,"likeCount":2,"duration":20,"pubdate":1700000000}'::jsonb,now()
from generate_series(1,4) n;
insert into public.submissions(id,user_id,platform,storage_provider,source_ref,cover_ref,pending_title,pending_description,file_size,mime_type)
values('40000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000002','cos','cos','source/video.mp4','source/cover.jpg','原创视频','简介',100,'video/mp4');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select pg_temp.expect_state($q$select public.approve_submission_with_palette('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','{}','[{"hex":"#FF0000"},{"hex":"ff0000"}]')$q$,'22023','duplicate HEX input');
select pg_temp.expect_state($q$select public.approve_submission_with_palette('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','{}','[{"hex":"#FF0000","percentage":1.1}]')$q$,'22023','percentage range');
select pg_temp.expect_state($q$select public.approve_submission_with_palette('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000099','{}','[{"hex":"#111122"}]')$q$,'23503','publish transaction rollback');
select pg_temp.assert_true(not exists(select 1 from public.tones where color_hex='#111122'),'rollback removes created tone');
select pg_temp.expect_state($q$select public.approve_submission_with_palette('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','{}','[{"hex":"#000001"},{"hex":"#000002"},{"hex":"#000003"},{"hex":"#000004"},{"hex":"#000005"},{"hex":"#000006"}]')$q$,'22023','six-color publishing denied');
select public.approve_submission_with_palette('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','{}','[{"hex":"#FF0000","percentage":0.6},{"hex":"#0000FF","percentage":0.1},{"hex":"#00FF00"},{"hex":"#808080"},{"hex":"#FFFF00"}]','审核通过');
select public.approve_submission_with_palette('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','{}','[{"hex":"#0000FF"}]');
select public.approve_submission_with_palette('40000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','{}','[{"hex":"#FF0100"}]');
select public.approve_cos_submission_with_palette('40000000-0000-0000-0000-000000000005','50000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','published/video.mp4','https://example.com/published.jpg','{}','[{"hex":"#CF3030","percentage":0.42},{"hex":"#0000FF"}]');
select pg_temp.expect_state($q$select public.approve_submission_with_palette('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','{}','[{"hex":"#111144"}]')$q$,'22023','second approval denied atomically');
select pg_temp.assert_true(not exists(select 1 from public.tones where color_hex='#111144'),'repeat approval rolls back extra tone');
select pg_temp.assert_true((select count(*) from public.tones where color_hex='#FF0000')=1,'existing HEX reused');
select pg_temp.assert_true((select count(*) from public.video_tones vt join public.videos v on v.id=vt.video_id where v.submission_id='40000000-0000-0000-0000-000000000001')=5,'five colors saved');
select pg_temp.assert_true((select percentage=0.6 and sort_order=0 from public.video_tones vt join public.videos v on v.id=vt.video_id where v.submission_id='40000000-0000-0000-0000-000000000001' and tone_id='30000000-0000-0000-0000-000000000001'),'percentage and palette order');
select pg_temp.assert_true((select published_at=to_timestamp(1700000000) from public.videos where submission_id='40000000-0000-0000-0000-000000000001'),'external publish timestamp retained');
select pg_temp.assert_true((select playback_ref='published/video.mp4' and title='原创视频' from public.videos where id='50000000-0000-0000-0000-000000000005'),'COS metadata retained');

insert into public.tones(name,color_hex) values('第六色','#123456');
select pg_temp.expect_state($q$insert into public.video_tones(video_id,tone_id) select v.id,t.id from public.videos v cross join public.tones t where v.submission_id='40000000-0000-0000-0000-000000000001' and t.color_hex='#123456'$q$,'23514','database sixth-color guard');
select pg_temp.expect_state($q$update public.video_tones set percentage=-0.1 where video_id='50000000-0000-0000-0000-000000000005'$q$,'23514','database percentage check');
select pg_temp.expect_state($q$update public.video_tones set sort_order=5 where video_id='50000000-0000-0000-0000-000000000005'$q$,'23514','database order check');
select pg_temp.expect_state($q$update public.video_tones set video_id=(select id from public.videos where submission_id='40000000-0000-0000-0000-000000000001') where video_id='50000000-0000-0000-0000-000000000005' and tone_id=(select id from public.tones where color_hex='#CF3030')$q$,'23514','moving an association cannot bypass max five');
insert into public.tones(name,color_hex) values('#111133','#111134');
select pg_temp.expect_state($q$select public.approve_submission_with_palette('40000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','{}','[{"hex":"#111133"}]')$q$,'23505','name collision is explicit');

-- Unpublished video with a color must remain invisible to public readers.
insert into public.videos(submission_id,platform,storage_provider,title,category_id)
values('40000000-0000-0000-0000-000000000004','bilibili','bilibili','未发布','10000000-0000-0000-0000-000000000001');
insert into public.video_tones(video_id,tone_id)
select id,'30000000-0000-0000-0000-000000000001' from public.videos where submission_id='40000000-0000-0000-0000-000000000004';
insert into public.tags(id,name) values('60000000-0000-0000-0000-000000000001','限定标签');
insert into public.video_tags(video_id,tag_id) select id,'60000000-0000-0000-0000-000000000001' from public.videos where submission_id='40000000-0000-0000-0000-000000000001';
-- Legacy callers can still publish five IDs during the cutover window.
reset role;
insert into public.submissions(id,user_id,platform,storage_provider,source_url,external_id,auto_fetched_meta,fetched_at)
select '40000000-0000-0000-0000-000000000006',user_id,platform,storage_provider,source_url,external_id,auto_fetched_meta,fetched_at from public.submissions where id='40000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select public.approve_submission('40000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001','{}',array(select tone_id from public.video_tones vt join public.videos v on v.id=vt.video_id where v.submission_id='40000000-0000-0000-0000-000000000001'));
update public.videos set published_at=null where submission_id='40000000-0000-0000-0000-000000000006';
reset role;

-- RLS denies an ordinary user's updates/deletes and relationship writes.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
update public.tones set name='unauthorized' where color_hex='#FF0000';
delete from public.tones where color_hex='#FF0000';
select pg_temp.assert_true((select name from public.tones where color_hex='#FF0000')='历史红','nonadmin update/delete affects no tones');
select pg_temp.expect_state($q$insert into public.video_tones(video_id,tone_id) values ('50000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000001')$q$,'42501','nonadmin relation insert');
update public.video_tones set percentage=0.9 where video_id='50000000-0000-0000-0000-000000000005';
delete from public.video_tones where video_id='50000000-0000-0000-0000-000000000005';
select pg_temp.assert_true((select count(*) from public.video_tones where video_id='50000000-0000-0000-0000-000000000005')=2,'nonadmin relation delete denied');
reset role;

set local role anon;
select pg_temp.assert_true((public.get_archive_videos_by_color()->>'total_count')::int=4,'public only published videos');
select pg_temp.assert_true((select count(*) from public.video_tones)=9,'public relations only published');
select pg_temp.assert_true((public.get_archive_videos_by_color(p_color_group_keys=>array['blue'])->>'total_count')::int=3,'group calculated from HEX, ignoring historical family');
select pg_temp.assert_true((public.get_archive_videos_by_color(p_colors=>'[{"hex":"#FF0000","precision":100}]')->>'total_count')::int=1,'exact match');
select pg_temp.assert_true((public.get_archive_videos_by_color(p_colors=>'[{"hex":"#FF0000","precision":98}]')->>'total_count')::int=2,'inclusive distance threshold');
select pg_temp.assert_true((public.get_archive_videos_by_color(p_colors=>'[{"hex":"#FF0000","precision":99}]')->>'total_count')::int=1,'outside distance threshold');
select pg_temp.assert_true((public.get_archive_videos_by_color(p_colors=>'[{"hex":"#FF0000","precision":100},{"hex":"#0000FF","precision":100}]',p_color_match_mode=>'any')->>'total_count')::int=3,'any match');
select pg_temp.assert_true((public.get_archive_videos_by_color(p_colors=>'[{"hex":"#FF0000","precision":100},{"hex":"#0000FF","precision":100}]',p_color_match_mode=>'all')->>'total_count')::int=1,'all match');
select pg_temp.assert_true((public.get_archive_videos_by_color(p_color_group_keys=>array['blue'],p_colors=>'[{"hex":"#FF0000","precision":100}]',p_tag_ids=>array['60000000-0000-0000-0000-000000000001'::uuid])->>'total_count')::int=1,'AND group, exact color, and tag');
select pg_temp.assert_true((public.get_archive_videos_by_color(p_category_id=>'10000000-0000-0000-0000-000000000099')->>'total_count')::int=0,'empty category');
select pg_temp.assert_true((public.get_archive_videos_by_color(p_colors=>'[{"hex":"#112233","precision":100}]')->>'total_count')::int=0,'empty color result');
select pg_temp.assert_true((public.get_archive_videos_by_color(p_limit=>1,p_offset=>1)->>'total_count')::int=4 and jsonb_array_length(public.get_archive_videos_by_color(p_limit=>1,p_offset=>1)->'items')=1,'count before pagination');
select pg_temp.assert_true(jsonb_array_length(public.get_archive_videos_by_color(p_offset=>999999)->'items')=0,'offset bounded');
select pg_temp.expect_state($q$select public.get_archive_videos_by_color(p_colors=>'[{"hex":"#FF0000","precision":101}]')$q$,'22023','precision upper limit');
select pg_temp.expect_state($q$select public.get_archive_videos_by_color(p_colors=>'[{"hex":"#FF0000","precision":30.5}]')$q$,'22023','precision integer');
select pg_temp.expect_state($q$select public.get_archive_videos_by_color(p_color_match_mode=>'invalid')$q$,'22023','invalid match mode');
select pg_temp.expect_state($q$select public.get_archive_videos_by_color(p_color_group_keys=>array['invalid'])$q$,'22023','invalid group');
select pg_temp.expect_state($q$select public.approve_submission_with_palette(null,null)$q$,'42501','anon cannot execute publish');
reset role;
rollback;
