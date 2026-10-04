// Isolated Postgres verification. No network, credentials, child_process, or app dependency.
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const modulePath = process.argv[2];
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : "@electric-sql/pglite");
const db = new PGlite();
const sql = async (path) => db.exec(await readFile(resolve(here, path), "utf8"));
const legacySecurityState = async () => (await db.query(`
  select * from (
    select 'policy' as kind, p.polname::text as subject,
      jsonb_build_object('command',p.polcmd,'roles',p.polroles,'permissive',p.polpermissive,
        'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) as rule
    from pg_policy p where p.polrelid='public.tone_families'::regclass
    union all
    select 'table_acl',a.grantee::text || ':' || a.privilege_type,jsonb_build_object('grantable',a.is_grantable)
    from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    where c.oid='public.tone_families'::regclass
    union all
    select 'rpc_acl',a.grantee::text || ':' || a.privilege_type,jsonb_build_object('grantable',a.is_grantable)
    from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    where p.oid=to_regprocedure('public.get_archive_videos(uuid,uuid[],text[],integer,integer)')
  ) rules order by kind,subject
`)).rows;
try {
  const files = await readdir(resolve(here, "../migrations"));
  const expansion = files.find((file) => file.endsWith("_realtime_video_palette_expand.sql"));
  if (!expansion) {
    throw new Error("Palette expansion migration is missing.");
  }
  const expansionSql = await readFile(resolve(here, `../migrations/${expansion}`), "utf8");
  const preflightDb = new PGlite();
  try {
    await preflightDb.exec(await readFile(resolve(here, "fixtures/realtime-video-palette.sql"), "utf8"));
    await preflightDb.exec(`insert into public.tones(name,color_hex,family_id) values('重复历史红','#FF0000','20000000-0000-0000-0000-000000000001')`);
    try {
      await preflightDb.exec(expansionSql);
      throw new Error("Duplicate HEX preflight should fail.");
    } catch (error) {
      if (error.code !== "23505" || !error.detail?.includes("30000000-0000-0000-0000-000000000001")) {
        throw error;
      }
      await preflightDb.exec("rollback");
    }
    const untouched = await preflightDb.query("select color_hex from public.tones where id='30000000-0000-0000-0000-000000000001'");
    if (untouched.rows[0].color_hex !== "#ff0000") {
      throw new Error("Failed preflight changed historical colors.");
    }
    console.log("PASS: duplicate HEX preflight provides conflict IDs and rolls back without merging");
  } finally {
    await preflightDb.close();
  }
  const recoveryDb = new PGlite();
  try {
    await recoveryDb.exec(await readFile(resolve(here, "fixtures/realtime-video-palette.sql"), "utf8"));
    await recoveryDb.exec(await readFile(resolve(here, "../migrations/20260711051745_use_external_video_publish_dates.sql"), "utf8"));
    await recoveryDb.exec(`
      create function private.enforce_video_tone_max() returns trigger language plpgsql as $$
      begin
        if (select count(*) from public.video_tones where video_id=new.video_id) >= 3 then
          raise exception 'Legacy three-color limit' using errcode='23514';
        end if;
        return new;
      end; $$;
      create trigger enforce_video_tone_max before insert on public.video_tones
        for each row execute function private.enforce_video_tone_max();
    `);
    const originalFunctions = (await recoveryDb.query(`select p.oid::regprocedure::text as signature, pg_get_functiondef(p.oid) as definition,
      (select jsonb_agg(jsonb_build_object('grantee',a.grantee,'privilege',a.privilege_type,'grantable',a.is_grantable) order by a.grantee,a.privilege_type)
        from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) as acl
      from pg_proc p where p.oid in (to_regprocedure('public.approve_submission(uuid,uuid,uuid[],uuid[],text)'),
        to_regprocedure('public.approve_cos_submission(uuid,uuid,uuid,text,text,uuid[],uuid[],text)'),
        to_regprocedure('private.enforce_video_tone_max()')) order by signature`)).rows;
    await recoveryDb.exec(expansionSql);
    const fullRollback = await readFile(resolve(here, "../post-deploy/rollback-palette-expand.sql"), "utf8");
    try {
      await recoveryDb.exec(fullRollback);
      throw new Error("Full rollback must require explicit verification.");
    } catch (error) {
      if (error.code !== "55000") { throw error; }
      await recoveryDb.exec("rollback");
    }
    await recoveryDb.exec(`set codex.palette_expand_rollback_verified='on';
      insert into public.tones(name,color_hex) values('New family-less color','#123456');`);
    try {
      await recoveryDb.exec(fullRollback);
      throw new Error("Full rollback must reject family-less colors.");
    } catch (error) {
      if (error.code !== "23514" || !error.message.includes("Assign legacy families")) { throw error; }
      await recoveryDb.exec("rollback");
    }
    await recoveryDb.exec(`update public.tones set family_id='20000000-0000-0000-0000-000000000001' where family_id is null;
      insert into public.video_tones(video_id,tone_id) select '50000000-0000-0000-0000-000000000099',id from public.tones where color_hex='#123456';
      insert into public.tones(name,color_hex,family_id) values('Fourth color','#654321','20000000-0000-0000-0000-000000000001');
      insert into public.video_tones(video_id,tone_id) select '50000000-0000-0000-0000-000000000099',id from public.tones where color_hex='#654321';`);
    try {
      await recoveryDb.exec(fullRollback);
      throw new Error("Full rollback must reject a four-color palette.");
    } catch (error) {
      if (error.code !== "23514" || !error.message.includes("three colors")) { throw error; }
      await recoveryDb.exec("rollback");
    }
    await recoveryDb.exec(`delete from public.video_tones where tone_id=(select id from public.tones where color_hex='#654321');
      update public.video_tones set percentage=.25 where tone_id='30000000-0000-0000-0000-000000000001';`);
    await recoveryDb.exec(fullRollback);
    const restoredFunctions = (await recoveryDb.query(`select p.oid::regprocedure::text as signature, pg_get_functiondef(p.oid) as definition,
      (select jsonb_agg(jsonb_build_object('grantee',a.grantee,'privilege',a.privilege_type,'grantable',a.is_grantable) order by a.grantee,a.privilege_type)
        from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) as acl
      from pg_proc p where p.oid in (to_regprocedure('public.approve_submission(uuid,uuid,uuid[],uuid[],text)'),
        to_regprocedure('public.approve_cos_submission(uuid,uuid,uuid,text,text,uuid[],uuid[],text)'),
        to_regprocedure('private.enforce_video_tone_max()')) order by signature`)).rows;
    // Compare effective ACLs: NULL and explicit defaults are semantically equal.
    if (JSON.stringify(restoredFunctions) !== JSON.stringify(originalFunctions)) {
      throw new Error("Full rollback did not restore original function definitions and grants.");
    }
    await recoveryDb.exec(`do $$ begin
      if exists(select 1 from information_schema.columns where table_schema='public' and table_name='video_tones' and column_name in ('percentage','sort_order')) then raise exception 'New columns remain'; end if;
      if to_regprocedure('public.get_archive_videos_by_color(uuid,uuid[],text[],jsonb,text,integer,integer)') is not null then raise exception 'New RPC remains'; end if;
      if (select color_hex from public.tones where id='30000000-0000-0000-0000-000000000001') <> '#ff0000' then raise exception 'Historical HEX not restored'; end if;
      if (select count(*) from public.video_tones) <> 3 then raise exception 'Rollback lost associations'; end if;
      if (select count(*) from public.tones) <> 4 then raise exception 'Rollback lost new colors'; end if;
      if (select percentage from private.palette_expand_rollback_video_tones where tone_id='30000000-0000-0000-0000-000000000001') <> .25 then raise exception 'Metadata archive missing'; end if;
    end $$;`);
    console.log("PASS: gated full expansion rollback restores functions/HEX, archives metadata, and blocks incompatible data without deleting it");
  } finally {
    await recoveryDb.close();
  }
  await sql("fixtures/realtime-video-palette.sql");
  await sql("../migrations/20260531121000_admin_review_policies.sql");
  await sql("../migrations/20260606001000_public_archive_filter_read_policies.sql");
  await db.exec(expansionSql);
  const assertionSql = await readFile(resolve(here, "realtime_video_palette.sql"), "utf8");
  // Keep its disposable rows only long enough to explain the real filter SELECT.
  await db.exec(assertionSql.replace(/\nrollback;\s*$/, "\n"));
  console.log("PASS: expansion, classification, publishing, filtering, rollback, RLS, and constraints");
  const archiveFunction = expansionSql.slice(expansionSql.indexOf("create or replace function public.get_archive_videos_by_color("));
  const start = archiveFunction.indexOf("\n  with args as (");
  const end = archiveFunction.indexOf("into result from total;");
  if (start < 0 || end < 0) {
    throw new Error("Cannot locate the archive SELECT for query-plan verification.");
  }
  const bindings = {
    p_category_id: "$1::uuid", p_tag_ids: "$2::uuid[]", group_keys: "$3::text[]",
    colors: "$4::jsonb", p_color_match_mode: "$5::text", p_limit: "$6::integer", p_offset: "$7::integer",
  };
  const archiveSelect = `${archiveFunction.slice(start, end)}from total;`.replace(
    /\b(p_category_id|p_tag_ids|group_keys|colors|p_color_match_mode|p_limit|p_offset)\b/g,
    (name) => bindings[name],
  );
  await db.exec("set local role anon");
  const queryPlan = await db.query(`explain (analyze, buffers, format json) ${archiveSelect}`,
    [null, [], ["blue"], [{ hex: "#0000FF", precision: 100 }], "any", 24, 0]);
  const plan = queryPlan.rows[0]["QUERY PLAN"][0];
  console.log(`PASS: actual archive filter SELECT EXPLAIN under anon RLS (${plan["Execution Time"]} ms); production performance remains unverified`);
  await db.exec("reset role; rollback");
  const securityBefore = await legacySecurityState();
  // New global defaults must not add grants absent from the historical snapshot.
  await db.exec(`
    create role palette_fixture_extra;
    alter default privileges in schema public grant select on tables to palette_fixture_extra, service_role;
    alter default privileges in schema public grant execute on functions to palette_fixture_extra, service_role;
  `);
  try {
    await sql("../post-deploy/contract-tone-families.sql");
    throw new Error("Ungated contraction should fail.");
  } catch (error) {
    if (error.code !== "55000") {
      throw error;
    }
    await db.exec("rollback");
  }
  await db.exec("set codex.palette_frontend_cutover_verified = 'on'");
  // Unquoted PostgreSQL identifiers are case insensitive, even in SQL strings.
  await db.exec(`create function public.palette_unknown_legacy_dependency() returns bigint language sql as $$ select count(*) from public.TONE_FAMILIES $$`);
  try {
    await sql("../post-deploy/contract-tone-families.sql");
    throw new Error("Uppercase unknown function dependency should block contraction.");
  } catch (error) {
    if (error.code !== "2BP01" || !error.detail?.includes("palette_unknown_legacy_dependency")) {
      throw error;
    }
    await db.exec("rollback");
  }
  const rejectedSnapshot = await db.query("select to_regclass('private.palette_legacy_tone_families') as families, to_regclass('private.palette_legacy_tone_mapping') as mappings, to_regclass('private.palette_legacy_color_ddl') as ddl");
  if (Object.values(rejectedSnapshot.rows[0]).some((value) => value !== null)) {
    throw new Error("Rejected contraction wrote a snapshot.");
  }
  await db.exec("drop function public.palette_unknown_legacy_dependency()");
  console.log("PASS: case-insensitive unknown dependency rejects contraction without snapshot writes");
  await sql("../post-deploy/contract-tone-families.sql");
  await db.exec(`
    do $$ begin
      if to_regclass('public.tone_families') is not null then raise exception 'Contraction left tone families'; end if;
      if exists(select 1 from information_schema.columns where table_schema='public' and table_name='tones' and column_name='family_id') then raise exception 'Contraction left family_id'; end if;
      if to_regclass('private.palette_legacy_tone_families') is null then raise exception 'Snapshot missing'; end if;
    end $$;
    select public.get_archive_videos_by_color(p_color_group_keys => array['red']);
  `);
  await sql("../post-deploy/restore-tone-families.sql");
  const securityAfter = await legacySecurityState();
  if (JSON.stringify(securityAfter) !== JSON.stringify(securityBefore)) {
    throw new Error("Recovered legacy policies or table/RPC grants differ from the snapshot.");
  }
  await db.exec(`
    do $$ begin
      if to_regclass('public.tone_families') is null then raise exception 'Restore failed'; end if;
      if (select family_id from public.tones where id='30000000-0000-0000-0000-000000000001') is distinct from '20000000-0000-0000-0000-000000000001'::uuid then raise exception 'Historical mapping not restored'; end if;
      if to_regprocedure('public.get_archive_videos(uuid,uuid[],text[],integer,integer)') is null then raise exception 'Legacy RPC not restored'; end if;
      if (select count(*) from pg_policies where schemaname='public' and tablename='tone_families') <> 4 then raise exception 'Legacy policies not restored'; end if;
      if exists (
        select 1 from pg_class c cross join lateral aclexplode(c.relacl) a
        where c.oid='public.tone_families'::regclass
          and a.grantee in ('palette_fixture_extra'::regrole::oid,'service_role'::regrole::oid)
      ) then raise exception 'Restored table inherited extra default grants'; end if;
      if exists (
        select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
        where p.oid=to_regprocedure('public.get_archive_videos(uuid,uuid[],text[],integer,integer)')
          and a.grantee in ('palette_fixture_extra'::regrole::oid,'service_role'::regrole::oid)
      ) then raise exception 'Restored RPC inherited extra default grants'; end if;
    end $$;
    set role anon;
    select * from public.tone_families;
    reset role;
  `);
  console.log("PASS: gated contraction, snapshot recovery, equal ACLs, and rejection of extra default grants");
} catch (error) {
  console.error(`FAIL ${error.code ?? ""}: ${error.message}`);
  if (error.detail) {
    console.error(error.detail);
  }
  if (error.where) {
    console.error(error.where);
  }
  process.exitCode = 1;
} finally {
  await db.close();
}
