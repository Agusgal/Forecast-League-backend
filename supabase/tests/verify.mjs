import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import assert from "node:assert/strict";

// Install the optional test runtime outside the app; see ../README.md.
// A fresh in-memory database is used, never a hosted Supabase project.
const require = createRequire(
  process.env.FORECAST_PGLITE_DIR
    ? resolve(process.env.FORECAST_PGLITE_DIR, "package.json")
    : new URL("../../package.json", import.meta.url),
);
let PGlite, pgcrypto;
try {
  ({ PGlite } = require("@electric-sql/pglite"));
  ({ pgcrypto } = require("@electric-sql/pglite/contrib/pgcrypto"));
} catch (error) {
  console.error(
    "Optional PGlite runtime unavailable. Follow supabase/README.md and set FORECAST_PGLITE_DIR.",
  );
  throw error;
}
const db = new PGlite({ extensions: { pgcrypto } });
try {
  await db.exec(`
create role anon; create role authenticated;
create schema auth; create schema extensions;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
grant usage on schema public,auth to anon,authenticated;
`);
  await db.exec(
    await readFile(
      new URL(
        "../migrations/202610120001_forecast_league.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(new URL("../seed.sql", import.meta.url), "utf8"),
  );
  await db.exec(
    await readFile(new URL("../seed.sql", import.meta.url), "utf8"),
  );
  assert.equal(
    (await db.query("select count(*)::integer as n from public.profiles"))
      .rows[0].n,
    0,
  );
  assert.equal(
    (await db.query("select count(*)::integer as n from public.forecasts"))
      .rows[0].n,
    0,
  );
  assert.ok(
    (await db.query("select is_demo from public.questions")).rows.every(
      (row) => row.is_demo,
    ),
  );
  console.log(
    "PASS migration and idempotent question-only seed execute on PostgreSQL",
  );

  const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    admin = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const q = "10000000-0000-4000-8000-000000000001";
  await db.query(
    "insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6)",
    [a, "a@test.test", b, "b@test.test", admin, "admin@test.test"],
  );
  const newcomer = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  await db.query(
    `insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{"is_admin":true,"role":"admin"}')`,
    [newcomer, "new@test.test"],
  );
  assert.equal(
    (
      await db.query("select is_admin from public.profiles where id=$1", [
        newcomer,
      ])
    ).rows[0].is_admin,
    false,
  );
  await db.query("update public.profiles set is_admin=true where id=$1", [
    admin,
  ]);
  const actor = async (id = null, role = "authenticated") => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      id ?? "",
    ]);
    await db.exec(`set role ${role}`);
  };
  const result = async (sql, args = []) => {
    const r = await db.query(sql, args);
    return r.rows[0]?.result;
  };
  const rejects = async (sql, args = [], message) => {
    let didThrow = false;
    try {
      await db.query(sql, args);
    } catch (e) {
      didThrow = true;
      if (message) assert.match(e.message, message);
    }
    assert.ok(didThrow, `Must reject: ${sql}`);
  };

  await actor(null, "anon");
  assert.equal(
    (await db.query("select * from public.questions")).rows.length,
    15,
  );
  await rejects("select * from public.forecasts", [], /permission denied/);
  await rejects("select public.get_leaderboard()", [], /permission denied/);
  console.log("PASS anonymous reads are limited to published questions");

  await actor(a);
  assert.equal(
    await result("select public.get_consensus($1) as result", [q]),
    null,
  );
  await rejects(
    "update public.profiles set is_admin=true where id=$1",
    [a],
    /permission denied/,
  );
  await rejects(
    "update public.profiles set id=$1 where id=$2",
    [admin, a],
    /permission denied/,
  );
  assert.equal(
    (
      await db.query(
        "update public.profiles set username='Stolen profile' where id=$1 returning id",
        [b],
      )
    ).rows.length,
    0,
  );
  // RLS filters unauthorized UPDATE rows; column-grant violations throw instead.
  assert.equal(
    (
      await db.query(
        "update public.questions set status='CLOSED' where id=$1 returning id",
        [q],
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select status from public.questions where id=$1", [q]))
      .rows[0].status,
    "PUBLISHED",
  );
  await rejects(
    "select public.transition_question($1,$2)",
    [q, "CLOSED"],
    /Administrator/,
  );
  await rejects(
    "select public.get_question_participation()",
    [],
    /Administrator/,
  );
  await rejects(
    "select public.submit_forecast($1,$2,$3)",
    [q, 0, "bad"],
    /Probability/,
  );
  await rejects(
    "select public.submit_forecast($1,$2,$3)",
    [q, 1, "bad"],
    /Probability/,
  );
  await rejects(
    "select public.submit_forecast($1,$2,$3)",
    [q, "NaN", "bad"],
    /Probability/,
  );
  await db.query("select public.submit_forecast($1,$2,$3)", [
    q,
    0.62,
    "First estimate",
  ]);
  await db.query("select public.submit_forecast($1,$2,$3)", [
    q,
    0.75,
    "Updated after evidence",
  ]);
  assert.equal(
    (await db.query("select * from public.forecasts")).rows[0].revision_count,
    2,
  );
  assert.equal(
    (await db.query("select * from public.forecast_revisions")).rows.length,
    2,
  );
  for (const table of [
    "forecasts",
    "forecast_revisions",
    "scores",
    "question_resolutions",
    "league_members",
  ]) {
    await rejects(`delete from public.${table}`, [], /permission denied/);
    await rejects(
      `insert into public.${table} default values`,
      [],
      /permission denied/,
    );
  }
  await rejects(
    "update public.forecasts set updated_at=now()-interval '1 year'",
    [],
    /permission denied/,
  );
  await rejects(
    "update public.forecast_revisions set created_at=now()-interval '1 year'",
    [],
    /permission denied/,
  );
  await rejects(
    "update public.scores set probability=0.99",
    [],
    /permission denied/,
  );
  await rejects(
    "update public.question_resolutions set outcome=1",
    [],
    /permission denied/,
  );
  await rejects(
    "update public.league_members set user_id=$1",
    [a],
    /permission denied/,
  );
  console.log(
    "PASS server-side forecasting, validation, revision history and protected writes",
  );

  await actor(b);
  assert.equal(
    (await db.query("select * from public.forecasts")).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select * from public.forecast_revisions")).rows.length,
    0,
  );
  assert.equal(
    await result("select public.get_consensus($1) as result", [q]),
    null,
  );
  await db.query("select public.submit_forecast($1,$2,$3)", [
    q,
    0.25,
    "Independent estimate",
  ]);
  const consensus = await result("select public.get_consensus($1) as result", [
    q,
  ]);
  assert.equal(consensus.probability, 0.5);
  assert.equal(consensus.participants, 2);
  assert.equal(
    consensus.distribution.reduce((sum, bin) => sum + bin.count, 0),
    2,
  );
  assert.equal(consensus.history.length, 1);
  assert.equal(consensus.history[0].probability, 0.5);
  console.log("PASS gated consensus and latest-revision daily history");

  await actor(admin);
  await rejects(
    "update public.questions set resolution_criteria=$1 where id=$2",
    ["Rewrite published terms", q],
    /cannot change/,
  );
  await rejects(
    "select public.resolve_question($1,$2,$3)",
    [q, 1, "yes"],
    /Close the question/,
  );
  await db.query("select public.transition_question($1,$2)", [q, "CLOSED"]);
  await rejects(
    "update public.questions set status='RESOLVED',outcome=1 where id=$1",
    [q],
    /Use resolve_question/,
  );
  await db.query("select public.resolve_question($1,$2,$3)", [
    q,
    1,
    "Verified against authoritative demonstration source",
  ]);
  await rejects(
    "select public.resolve_question($1,$2,$3)",
    [q, 0, "rewrite"],
    /Close the question/,
  );
  await rejects(
    "update public.scores set probability=0.99",
    [],
    /permission denied/,
  );
  await rejects(
    "update public.question_resolutions set outcome=0",
    [],
    /permission denied/,
  );
  const participation = await result(
    "select public.get_question_participation() as result",
  );
  assert.equal(participation.find((x) => x.questionId === q).participants, 2);
  assert.equal(participation.find((x) => x.questionId === q).revisions, 3);
  await actor(a);
  await rejects(
    "select public.submit_forecast($1,$2,$3)",
    [q, 0.8, "late"],
    /closed/,
  );
  const score = (await db.query("select * from public.scores")).rows[0];
  assert.equal(Number(score.brier), 0.0625);
  assert.equal(Number(score.probability), 0.75);
  const stats = await result("select public.get_profile_stats() as result");
  assert.equal(stats.resolvedCount, 1);
  assert.equal(stats.meanBrier, 0.0625);
  assert.equal(stats.points, 938);
  assert.deepEqual(stats.calibration, [
    { probability: 0.75, outcome: 1, count: 1 },
  ]);
  const ranks = await result("select public.get_leaderboard() as result");
  assert.equal(ranks.length, 2);
  assert.equal(ranks[0].userId, a);
  assert.equal(ranks[1].points, 438);
  console.log(
    "PASS explicit lifecycle, immutable outcomes, last-revision Brier, stats and ranking",
  );

  const league = (
    await db.query("select * from public.create_league($1,$2,$3)", [
      "Test league",
      "Private shared-question league",
      "weekly",
    ])
  ).rows[0];
  assert.equal(
    (await result("select public.get_leagues() as result")).length,
    1,
  );
  await rejects(
    "update public.leagues set owner_id=$1 where id=$2",
    [b, league.id],
    /permission denied/,
  );
  await rejects(
    "update public.leagues set code='BYPASS' where id=$1",
    [league.id],
    /permission denied/,
  );
  await actor(b);
  assert.equal((await db.query("select * from public.leagues")).rows.length, 0);
  assert.equal(
    (await db.query("select * from public.league_members")).rows.length,
    0,
  );
  await db.query("select public.join_league($1)", [league.code]);
  await db.query("select public.join_league($1)", [league.code]);
  const leagues = await result("select public.get_leagues() as result");
  assert.equal(leagues.length, 1);
  assert.equal(leagues[0].memberCount, 2);
  assert.equal(leagues[0].members[0].resolvedCount, 1);
  assert.equal(leagues[0].members[0].userId, a);
  await actor(admin);
  assert.equal((await db.query("select * from public.leagues")).rows.length, 0);
  console.log(
    "PASS private invitation membership and shared-question league standings",
  );

  await actor(newcomer);
  await rejects(
    "select public.join_league($1)",
    ["nonexistent-code"],
    /Invitation code not found/,
  );
  await db.query("select public.join_league($1)", [league.code]);
  const changedLeague = (
    await result("select public.get_leagues() as result")
  )[0];
  assert.equal(changedLeague.memberCount, 3);
  assert.ok(
    changedLeague.members.every(
      (member) => member.resolvedCount === 0 && member.rank === 0,
    ),
  );
  assert.deepEqual(
    await result("select public.get_leaderboard() as result"),
    ranks,
  );
  await rejects(
    "delete from public.league_members where league_id=$1",
    [league.id],
    /permission denied/,
  );
  await actor(a);
  assert.equal(
    Number((await db.query("select * from public.scores")).rows[0].brier),
    0.0625,
  );
  console.log(
    "PASS new-member shared-sample behavior without altering finalized scores or global ranks",
  );

  await actor(admin);
  const expiring = (
    await db.query(`insert into public.questions(title,category,horizon,opens_at,closes_at,resolves_at,resolution_criteria,source_name,source_url)
 values('Will the short window close?','Science & tech','daily',now()-interval '1 day',clock_timestamp()+interval '2 seconds',now()+interval '2 days','YES if the exact condition is met.','Test source','https://example.com') returning id,closes_at`)
  ).rows[0];
  const expired = expiring.id;
  await db.query("select public.transition_question($1,$2)", [
    expired,
    "PUBLISHED",
  ]);
  await actor(a);
  await db.query("select public.submit_forecast($1,$2)", [expired, 0.3]);
  await new Promise((r) =>
    setTimeout(
      r,
      Math.max(0, new Date(expiring.closes_at).getTime() - Date.now() + 50),
    ),
  );
  await rejects(
    "select public.submit_forecast($1,$2)",
    [expired, 0.7],
    /closed/,
  );
  console.log("PASS server-clock deadline while status remains PUBLISHED");

  await actor(admin);
  const draft = (
    await db.query(`insert into public.questions(title,category,horizon,opens_at,closes_at,resolves_at,resolution_criteria,source_name,source_url)
 values('Will a future event happen?','Science & tech','daily',now()+interval '2 days',now()+interval '3 days',now()+interval '4 days','YES if the exact condition is met.','Test source','https://example.com') returning id`)
  ).rows[0].id;
  await actor(null, "anon");
  assert.equal(
    (await db.query("select * from public.questions where id=$1", [draft])).rows
      .length,
    0,
  );
  await actor(a);
  assert.equal(
    (await db.query("select * from public.questions where id=$1", [draft])).rows
      .length,
    0,
  );
  await actor(admin);
  await db.query("select public.transition_question($1,$2)", [
    draft,
    "PUBLISHED",
  ]);
  const comp = (
    await db.query(
      `insert into public.competitions(title,period,starts_at,ends_at) values('Fixed event','weekly',now()+interval '1 day',now()+interval '5 days') returning id`,
    )
  ).rows[0].id;
  await db.query(
    "insert into public.competition_questions(competition_id,question_id) values($1,$2)",
    [comp, draft],
  );
  await db.query(
    "update public.competitions set status='PUBLISHED' where id=$1",
    [comp],
  );
  await rejects(
    "delete from public.competition_questions where competition_id=$1",
    [comp],
    /immutable/,
  );
  await rejects(
    "insert into public.competition_questions(competition_id,question_id) values($1,$2)",
    [comp, q],
    /immutable/,
  );
  await rejects(
    "update public.competitions set title='Changed rules' where id=$1",
    [comp],
    /frozen/,
  );
  await rejects(
    "update public.competitions set scoring_rules='{}' where id=$1",
    [comp],
    /frozen/,
  );
  await rejects("select public.submit_forecast($1,$2)", [draft, 0.8], /closed/);
  console.log("PASS frozen published competition sets and future opening gate");

  // Match the domain's ranking precision while preserving unrounded accuracy.
  const tieA = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const tieB = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  await db.exec("reset role");
  await db.query(
    "insert into auth.users(id,email) values($1,$2),($3,$4)",
    [tieA, "tie-a@test.test", tieB, "tie-b@test.test"],
  );
  await actor(admin);
  const tieQuestion = (
    await db.query(`insert into public.questions(title,category,horizon,opens_at,closes_at,resolves_at,resolution_criteria,source_name,source_url)
 values('Will these accuracy scores tie?','Science & tech','daily',now()-interval '1 day',now()+interval '1 day',now()+interval '2 days','YES if the exact condition is met.','Test source','https://example.com') returning id`)
  ).rows[0].id;
  await db.query("select public.transition_question($1,$2)", [tieQuestion, "PUBLISHED"]);
  await actor(tieA);
  await db.query("select public.submit_forecast($1,$2)", [tieQuestion, "0.8"]);
  const tieLeague = (
    await db.query("select * from public.create_league($1,$2,$3)", ["Tie precision", "", "weekly"])
  ).rows[0];
  await actor(tieB);
  await db.query("select public.submit_forecast($1,$2)", [tieQuestion, "0.80000000000001"]);
  await db.query("select public.join_league($1)", [tieLeague.code]);
  await actor(admin);
  await db.query("select public.transition_question($1,$2)", [tieQuestion, "CLOSED"]);
  await db.query("select public.resolve_question($1,$2)", [tieQuestion, 1]);
  await actor(tieA);
  const tieRanks = (await result("select public.get_leaderboard() as result"))
    .filter(row => [tieA, tieB].includes(row.userId));
  assert.equal(tieRanks.length, 2);
  assert.notEqual(tieRanks[0].meanBrier, tieRanks[1].meanBrier);
  assert.equal(tieRanks[0].rank, tieRanks[1].rank);
  const tieMembers = (await result("select public.get_leagues() as result"))[0].members;
  assert.equal(tieMembers[0].rank, tieMembers[1].rank);
  assert.notEqual(tieMembers[0].meanBrier, tieMembers[1].meanBrier);
  console.log("PASS shared ranking precision preserves raw accuracy and global/league ties");

  await actor(a);
  await db.exec(
    "create temp table profiles(id uuid,is_admin boolean); set search_path=pg_temp,public",
  );
  await db.query("insert into pg_temp.profiles values($1,true)", [a]);
  assert.equal(await result("select public.is_admin() as result"), false);
  await rejects(
    "select public.transition_question($1,$2)",
    [draft, "CLOSED"],
    /Administrator/,
  );
  console.log(
    "PASS security-definer object resolution resists caller search_path shadowing",
  );
} finally {
  await db.close();
}
