-- Forecast League. Apply once to a fresh Supabase project.
-- Browser/server clients use the user's JWT and the public anon key, never service_role.
create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (char_length(username) between 2 and 32),
  country text not null default 'Global' check (char_length(country) between 2 and 64),
  avatar_color text not null default '#4668e8' check (avatar_color ~ '^#[0-9a-fA-F]{6}$'),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index profiles_username_key on public.profiles (lower(username));

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 10 and 180),
  description text not null default '' check (char_length(description) <= 5000),
  category text not null check (category in ('Science & tech','Climate','World','Sports','Economy')),
  horizon text not null check (horizon in ('daily','weekly','monthly','long-term')),
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','CLOSED','RESOLVED','CANCELLED','VOID')),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  resolves_at timestamptz not null,
  resolution_criteria text not null check (char_length(resolution_criteria) between 10 and 5000),
  source_name text not null check (char_length(source_name) between 2 and 120),
  source_url text not null check (source_url ~ '^https?://[^[:space:]]+$'),
  outcome smallint check (outcome in (0,1)),
  visual text not null default 'world' check (visual in ('space','climate','ai','world','sports','economy')),
  is_demo boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (opens_at < closes_at and closes_at <= resolves_at),
  check ((status = 'RESOLVED') = (outcome is not null))
);
create index questions_feed_idx on public.questions (status,horizon,closes_at);

create table public.forecasts (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  probability numeric not null check (probability between 0.01 and 0.99),
  reasoning text not null default '' check (char_length(reasoning) <= 2000),
  updated_at timestamptz not null default clock_timestamp(),
  revision_count integer not null default 1 check (revision_count > 0),
  unique (question_id,user_id),
  unique (id,question_id,user_id)
);
create index forecasts_user_idx on public.forecasts(user_id,updated_at desc);

create table public.forecast_revisions (
  id uuid primary key default gen_random_uuid(),
  forecast_id uuid not null,
  question_id uuid not null,
  user_id uuid not null,
  probability numeric not null check (probability between 0.01 and 0.99),
  reasoning text not null check (char_length(reasoning) <= 2000),
  revision_number integer not null check (revision_number > 0),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (forecast_id,question_id,user_id) references public.forecasts(id,question_id,user_id) on delete cascade,
  unique (forecast_id,revision_number)
);
create index forecast_revisions_question_time_idx on public.forecast_revisions (question_id,created_at desc);
create index forecast_revisions_user_idx on public.forecast_revisions (user_id,question_id,revision_number desc);

create table public.question_resolutions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null unique references public.questions(id),
  outcome smallint not null check (outcome in (0,1)),
  notes text not null default '' check (char_length(notes) <= 5000),
  resolved_by uuid not null references public.profiles(id),
  resolved_at timestamptz not null default clock_timestamp(),
  unique (id,question_id)
);

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  forecast_id uuid not null,
  revision_id uuid not null references public.forecast_revisions(id),
  resolution_id uuid not null,
  probability numeric not null check (probability between 0.01 and 0.99),
  outcome smallint not null check (outcome in (0,1)),
  brier numeric generated always as ((probability - outcome) * (probability - outcome)) stored,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (forecast_id,question_id,user_id) references public.forecasts(id,question_id,user_id) on delete cascade,
  foreign key (resolution_id,question_id) references public.question_resolutions(id,question_id),
  unique (question_id,user_id)
);
create index scores_user_idx on public.scores(user_id,created_at desc);

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  description text not null default '' check (char_length(description) <= 300),
  code text not null unique default encode(extensions.gen_random_bytes(6),'hex'),
  owner_id uuid not null references public.profiles(id),
  period text not null check (period in ('weekly','monthly')),
  created_at timestamptz not null default now()
);
create table public.league_members (
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id,user_id)
);
create index league_members_user_idx on public.league_members(user_id,league_id);

-- Foundation for curated official competitions. No competition is published by seed.
-- MVP private league rankings use common resolved questions; official competitions
-- require a fixed question set and this fixed scoring policy before publication.
create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  league_id uuid references public.leagues(id),
  title text not null check (char_length(title) between 2 and 120),
  period text not null check (period in ('weekly','monthly')),
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','CLOSED','CANCELLED')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  scoring_rules jsonb not null default '{"method":"mean_brier","forecast":"last_before_deadline","points":"round(1000*(1-mean_brier))","missing_forecast_brier":1}'::jsonb,
  created_at timestamptz not null default now(),
  check (starts_at < ends_at),
  check (scoring_rules = '{"method":"mean_brier","forecast":"last_before_deadline","points":"round(1000*(1-mean_brier))","missing_forecast_brier":1}'::jsonb)
);
create table public.competition_questions (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  question_id uuid not null references public.questions(id),
  primary key (competition_id,question_id)
);
create index competition_questions_question_idx on public.competition_questions(question_id);

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.is_admin);
$$;
create function public.is_league_member(p_league_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.league_members m where m.league_id = p_league_id and m.user_id = auth.uid());
$$;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Never copy role/admin flags from editable auth metadata.
  insert into public.profiles(id,username) values(new.id,'forecaster_' || substr(replace(new.id::text,'-',''),1,20));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create function public.guard_question() returns trigger
language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    if new.status <> 'DRAFT' or new.outcome is not null then
      raise exception 'New questions must begin as drafts';
    end if;
    new.created_at := clock_timestamp();
    new.published_at := null;
  else
    if new.id <> old.id or new.created_at <> old.created_at then
      raise exception 'Question identity and creation time are immutable';
    end if;
    if old.status <> 'DRAFT' and (
      row(new.title,new.description,new.category,new.horizon,new.opens_at,new.closes_at,new.resolution_criteria,new.source_name,new.source_url,new.visual,new.is_demo,new.resolves_at)
      is distinct from
      row(old.title,old.description,old.category,old.horizon,old.opens_at,old.closes_at,old.resolution_criteria,old.source_name,old.source_url,old.visual,old.is_demo,old.resolves_at)
    ) then raise exception 'Published question terms cannot change; void and replace an ambiguous question'; end if;
    if new.status <> old.status and not (
      (old.status = 'DRAFT' and new.status in ('PUBLISHED','CANCELLED')) or
      (old.status = 'PUBLISHED' and new.status in ('CLOSED','CANCELLED','VOID')) or
      (old.status = 'CLOSED' and new.status in ('RESOLVED','CANCELLED','VOID'))
    ) then raise exception 'Invalid question lifecycle transition'; end if;
    if new.status = 'RESOLVED' and not exists (
      select 1 from public.question_resolutions r where r.question_id = new.id and r.outcome = new.outcome
    ) then raise exception 'Use resolve_question to finalize a question'; end if;
    if old.status = 'RESOLVED' and new.outcome is distinct from old.outcome then
      raise exception 'Final outcome is immutable';
    end if;
    new.published_at := old.published_at;
    if old.status = 'DRAFT' and new.status = 'PUBLISHED' then
      if new.closes_at <= clock_timestamp() then raise exception 'A question must be published before its deadline'; end if;
      new.published_at := clock_timestamp();
    end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger guard_question before insert or update on public.questions for each row execute function public.guard_question();

create function public.guard_competition() returns trigger
language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    if new.status <> 'DRAFT' then raise exception 'Create a draft competition first'; end if;
  else
    if old.status <> 'DRAFT' and row(new.title,new.league_id,new.period,new.starts_at,new.ends_at,new.scoring_rules)
      is distinct from row(old.title,old.league_id,old.period,old.starts_at,old.ends_at,old.scoring_rules)
      then raise exception 'Published competition terms are frozen'; end if;
    if new.status <> old.status and not (
      (old.status = 'DRAFT' and new.status in ('PUBLISHED','CANCELLED')) or
      (old.status = 'PUBLISHED' and new.status in ('CLOSED','CANCELLED'))
    ) then raise exception 'Invalid competition transition'; end if;
    if old.status = 'DRAFT' and new.status = 'PUBLISHED' then
      if new.starts_at <= clock_timestamp() then raise exception 'Publish before the competition starts'; end if;
      if not exists(select 1 from public.competition_questions cq where cq.competition_id = new.id) then
        raise exception 'A competition needs a fixed question set';
      end if;
      if exists(select 1 from public.competition_questions cq join public.questions q on q.id = cq.question_id
        where cq.competition_id = new.id and (q.status <> 'PUBLISHED' or q.opens_at < new.starts_at or q.closes_at > new.ends_at)) then
        raise exception 'All competition questions must be published and their windows fit the competition';
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_competition before insert or update on public.competitions for each row execute function public.guard_competition();

create function public.guard_competition_questions() returns trigger
language plpgsql set search_path = '' as $$
declare v_status text;
begin
  if TG_OP in ('UPDATE','DELETE') then
    select status into v_status from public.competitions where id = old.competition_id for update;
    if v_status is distinct from 'DRAFT' then raise exception 'Published question sets are immutable'; end if;
  end if;
  if TG_OP in ('INSERT','UPDATE') then
    select status into v_status from public.competitions where id = new.competition_id for update;
    if v_status is distinct from 'DRAFT' then raise exception 'Published question sets are immutable'; end if;
    return new;
  end if;
  return old;
end;
$$;
create trigger guard_competition_questions before insert or update or delete on public.competition_questions
  for each row execute function public.guard_competition_questions();

create function public.submit_forecast(p_question_id uuid,p_probability numeric,p_reasoning text default '') returns public.forecasts
language plpgsql security definer set search_path = '' as $$
declare v_question public.questions; v_forecast public.forecasts; v_time timestamptz; v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_probability is null or p_probability not between 0.01 and 0.99 then
    raise exception 'Probability must be between 0.01 and 0.99' using errcode = '22023';
  end if;
  if char_length(coalesce(p_reasoning,'')) > 2000 then raise exception 'Reasoning is too long' using errcode = '22023'; end if;
  -- This row lock serializes deadline/state changes, resolution and submissions.
  select * into v_question from public.questions where id = p_question_id for update;
  if not found then raise exception 'Question not found' using errcode = 'P0002'; end if;
  v_time := clock_timestamp();
  if v_question.status <> 'PUBLISHED' or v_time < v_question.opens_at or v_time >= v_question.closes_at then
    raise exception 'Forecasting is closed for this question' using errcode = '22023';
  end if;
  insert into public.forecasts(question_id,user_id,probability,reasoning,updated_at)
    values(p_question_id,v_user,p_probability,coalesce(p_reasoning,''),v_time)
    on conflict (question_id,user_id) do update set probability = excluded.probability,
      reasoning = excluded.reasoning,updated_at = excluded.updated_at,revision_count = public.forecasts.revision_count + 1
    returning * into v_forecast;
  insert into public.forecast_revisions(forecast_id,question_id,user_id,probability,reasoning,revision_number,created_at)
    values(v_forecast.id,p_question_id,v_user,p_probability,v_forecast.reasoning,v_forecast.revision_count,v_time);
  return v_forecast;
end;
$$;

create function public.transition_question(p_question_id uuid,p_status text) returns public.questions
language plpgsql security definer set search_path = '' as $$
declare v_question public.questions;
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('PUBLISHED','CLOSED','CANCELLED','VOID') then
    raise exception 'Use a valid lifecycle transition; resolving requires resolve_question';
  end if;
  update public.questions set status = p_status where id = p_question_id returning * into v_question;
  if not found then raise exception 'Question not found' using errcode = 'P0002'; end if;
  return v_question;
end;
$$;

create function public.resolve_question(p_question_id uuid,p_outcome integer,p_notes text default '') returns public.questions
language plpgsql security definer set search_path = '' as $$
declare v_question public.questions; v_resolution uuid; v_time timestamptz;
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  if p_outcome is null or p_outcome not in (0,1) then raise exception 'Outcome must be 0 or 1'; end if;
  if char_length(coalesce(p_notes,'')) > 5000 then raise exception 'Resolution notes are too long'; end if;
  select * into v_question from public.questions where id = p_question_id for update;
  if not found then raise exception 'Question not found' using errcode = 'P0002'; end if;
  v_time := clock_timestamp();
  if v_question.status <> 'CLOSED' then
    raise exception 'Close the question before resolving it';
  end if;
  insert into public.question_resolutions(question_id,outcome,notes,resolved_by,resolved_at)
    values(p_question_id,p_outcome,coalesce(p_notes,''),auth.uid(),v_time) returning id into v_resolution;
  insert into public.scores(question_id,user_id,forecast_id,revision_id,resolution_id,probability,outcome,created_at)
    select p_question_id,r.user_id,r.forecast_id,r.id,v_resolution,r.probability,p_outcome,v_time
    from (
      select distinct on (fr.user_id) fr.* from public.forecast_revisions fr
      where fr.question_id = p_question_id and fr.created_at < v_question.closes_at
      order by fr.user_id,fr.revision_number desc
    ) r;
  update public.questions set status = 'RESOLVED',outcome = p_outcome where id = p_question_id returning * into v_question;
  return v_question;
end;
$$;

create function public.get_consensus(p_question_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not exists(select 1 from public.forecasts where question_id = p_question_id and user_id = auth.uid()) then
    return null; -- No aggregate, count or distribution before the caller's own forecast.
  end if;
  with current_forecasts as (
    select probability from public.forecasts where question_id = p_question_id
  ), bins as (
    select b,case b when 0 then '1–20%' when 1 then '21–40%' when 2 then '41–60%' when 3 then '61–80%' else '81–99%' end as label
    from generate_series(0,4) b
  ), distribution as (
    select bins.b,bins.label,count(f.probability)::integer as count from bins
    left join current_forecasts f on least(4,ceil(f.probability * 5)::integer - 1) = bins.b group by bins.b,bins.label
  ), days as (
    select distinct (created_at at time zone 'UTC')::date as day from public.forecast_revisions where question_id = p_question_id
  ), history as (
    select d.day,(select avg(last_revision.probability) from (
      select distinct on (r.user_id) r.probability from public.forecast_revisions r
      where r.question_id = p_question_id and r.created_at < ((d.day + 1)::timestamp at time zone 'UTC')
      order by r.user_id,r.revision_number desc
    ) last_revision) as probability from days d
  )
  select jsonb_build_object(
    'probability',(select avg(probability) from current_forecasts),
    'participants',(select count(*) from current_forecasts),
    'distribution',(select coalesce(jsonb_agg(jsonb_build_object('label',label,'count',count) order by b),'[]'::jsonb) from distribution),
    'history',(select coalesce(jsonb_agg(jsonb_build_object('date',day,'probability',probability) order by day),'[]'::jsonb) from history)
  ) into v_result;
  return v_result;
end;
$$;

create function public.get_leaderboard() returns jsonb
language sql stable security definer set search_path = '' as $$
  with accuracy as (
    select s.user_id,avg(s.brier) as mean_brier,count(*)::integer as resolved_count
    from public.scores s join public.questions q on q.id = s.question_id where q.status = 'RESOLVED' group by s.user_id
  ), ranked as (
    select p.id,p.username,p.country,a.mean_brier,a.resolved_count,
      round(1000 * (1 - a.mean_brier))::integer as points,rank() over(order by round(a.mean_brier,12)) as rank
    from accuracy a join public.profiles p on p.id = a.user_id
  ) select coalesce(jsonb_agg(jsonb_build_object('userId',id,'username',username,'country',country,
    'meanBrier',mean_brier,'resolvedCount',resolved_count,'points',points,'rank',rank) order by rank,username),'[]'::jsonb) from ranked;
$$;

create function public.get_profile_stats() returns jsonb
language sql stable security definer set search_path = '' as $$
  with mine as (
    select s.*,q.category from public.scores s join public.questions q on q.id = s.question_id
    where s.user_id = auth.uid() and q.status = 'RESOLVED'
  ), calibration as (
    select avg(probability) as probability,avg(outcome) as outcome,count(*)::integer as count
    from mine group by floor(probability * 10)
  ), categories as (
    select category,avg(brier) as mean_brier,count(*)::integer as count from mine group by category
  ) select jsonb_build_object('resolvedCount',(select count(*) from mine),'meanBrier',(select avg(brier) from mine),
    'points',(select coalesce(round(1000 * (1 - avg(brier))),0) from mine),
    'forecastCount',(select count(*) from public.forecasts where user_id = auth.uid()),
    'calibration',(select coalesce(jsonb_agg(jsonb_build_object('probability',probability,'outcome',outcome,'count',count) order by probability),'[]'::jsonb) from calibration),
    'categories',(select coalesce(jsonb_agg(jsonb_build_object('category',category,'meanBrier',mean_brier,'count',count) order by category),'[]'::jsonb) from categories));
$$;

create function public.get_question_participation() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('questionId',q.id,
    'participants',(select count(*) from public.forecasts f where f.question_id = q.id),
    'revisions',(select count(*) from public.forecast_revisions r where r.question_id = q.id)) order by q.created_at desc),'[]'::jsonb)
    from public.questions q);
end;
$$;

create function public.create_league(p_name text,p_description text default '',p_period text default 'weekly') returns public.leagues
language plpgsql security definer set search_path = '' as $$
declare v_league public.leagues;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  insert into public.leagues(name,description,owner_id,period) values(trim(p_name),coalesce(p_description,''),auth.uid(),p_period)
    returning * into v_league;
  insert into public.league_members(league_id,user_id) values(v_league.id,auth.uid());
  return v_league;
end;
$$;
create function public.join_league(p_code text) returns public.leagues
language plpgsql security definer set search_path = '' as $$
declare v_league public.leagues;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_league from public.leagues where code = lower(trim(p_code));
  if not found then raise exception 'Invitation code not found' using errcode = 'P0002'; end if;
  insert into public.league_members(league_id,user_id) values(v_league.id,auth.uid()) on conflict do nothing;
  return v_league;
end;
$$;

create function public.get_leagues() returns jsonb
language sql stable security definer set search_path = '' as $$
  with mine as (
    select l.* from public.leagues l join public.league_members m on m.league_id = l.id where m.user_id = auth.uid()
  ), member_counts as (
    select m.league_id,count(*) as total from public.league_members m join mine l on l.id = m.league_id group by m.league_id
  ), shared_questions as (
    select m.league_id,s.question_id from public.league_members m join mine l on l.id = m.league_id
    join public.scores s on s.user_id = m.user_id join public.questions q on q.id = s.question_id
    where q.status = 'RESOLVED' and s.created_at >= (
      case l.period when 'weekly' then date_trunc('week',now() at time zone 'UTC') at time zone 'UTC'
        else date_trunc('month',now() at time zone 'UTC') at time zone 'UTC' end
    ) group by m.league_id,s.question_id having count(*) = (select mc.total from member_counts mc where mc.league_id = m.league_id)
  ), accuracy as (
    select m.league_id,m.user_id,avg(s.brier) as mean_brier,count(s.id)::integer as resolved_count
    from public.league_members m join mine l on l.id = m.league_id
    left join shared_questions sq on sq.league_id = m.league_id
    left join public.scores s on s.question_id = sq.question_id and s.user_id = m.user_id group by m.league_id,m.user_id
  ), ranked as (
    select a.*,p.username,p.country,case when a.resolved_count = 0 then 0 else rank() over(partition by a.league_id order by round(a.mean_brier,12) nulls last) end as rank
    from accuracy a join public.profiles p on p.id = a.user_id
  ) select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'description',l.description,'code',l.code,
    'ownerId',l.owner_id,'period',l.period,'memberCount',(select mc.total from member_counts mc where mc.league_id = l.id),
    'members',(select coalesce(jsonb_agg(jsonb_build_object('userId',r.user_id,'username',r.username,'country',r.country,
      'meanBrier',coalesce(r.mean_brier,0),'resolvedCount',r.resolved_count,'points',coalesce(round(1000 * (1 - r.mean_brier)),0),'rank',r.rank)
      order by r.rank,r.username),'[]'::jsonb) from ranked r where r.league_id = l.id)) order by l.created_at desc),'[]'::jsonb) from mine l;
$$;

-- Explicit grants plus RLS: a forged API request cannot write forecasts, revisions,
-- timestamps, scores, final resolutions, memberships, or administrator flags.
alter table public.profiles enable row level security;
alter table public.questions enable row level security;
alter table public.forecasts enable row level security;
alter table public.forecast_revisions enable row level security;
alter table public.question_resolutions enable row level security;
alter table public.scores enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.competitions enable row level security;
alter table public.competition_questions enable row level security;

revoke all on public.profiles,public.questions,public.forecasts,public.forecast_revisions,public.question_resolutions,
  public.scores,public.leagues,public.league_members,public.competitions,public.competition_questions from anon,authenticated;
grant select on public.questions to anon,authenticated;
grant select on public.profiles,public.forecasts,public.forecast_revisions,public.question_resolutions,public.scores,
  public.leagues,public.league_members,public.competitions,public.competition_questions to authenticated;
grant update(username,country,avatar_color) on public.profiles to authenticated;
grant insert,update on public.questions,public.competitions to authenticated;
grant insert,update,delete on public.competition_questions to authenticated;

create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy questions_read on public.questions for select to anon,authenticated using (status <> 'DRAFT' or public.is_admin());
create policy questions_admin_insert on public.questions for insert to authenticated with check (public.is_admin());
create policy questions_admin_update on public.questions for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy forecasts_read_own on public.forecasts for select to authenticated using (user_id = auth.uid());
create policy revisions_read_own on public.forecast_revisions for select to authenticated using (user_id = auth.uid());
create policy scores_read_own on public.scores for select to authenticated using (user_id = auth.uid());
create policy resolutions_read on public.question_resolutions for select to authenticated using (true);
create policy leagues_read_member on public.leagues for select to authenticated using (public.is_league_member(id));
create policy league_members_read_member on public.league_members for select to authenticated using (public.is_league_member(league_id));
create policy competitions_read on public.competitions for select to authenticated using (public.is_admin() or (status <> 'DRAFT' and (league_id is null or public.is_league_member(league_id))));
create policy competitions_admin_insert on public.competitions for insert to authenticated with check (public.is_admin());
create policy competitions_admin_update on public.competitions for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy competition_questions_read on public.competition_questions for select to authenticated using (
  exists(select 1 from public.competitions c where c.id = competition_id)
);
create policy competition_questions_admin_insert on public.competition_questions for insert to authenticated with check (public.is_admin());
create policy competition_questions_admin_update on public.competition_questions for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy competition_questions_admin_delete on public.competition_questions for delete to authenticated using (public.is_admin());

-- Postgres otherwise gives PUBLIC execute on newly created functions.
revoke all on function public.is_admin(),public.is_league_member(uuid),public.handle_new_user(),public.guard_question(),
  public.guard_competition(),public.guard_competition_questions(),public.submit_forecast(uuid,numeric,text),
  public.transition_question(uuid,text),public.resolve_question(uuid,integer,text),public.get_consensus(uuid),
  public.get_leaderboard(),public.get_profile_stats(),public.get_question_participation(),public.create_league(text,text,text),public.join_league(text),public.get_leagues()
  from public,anon,authenticated;
grant execute on function public.is_admin() to anon,authenticated;
grant execute on function public.is_league_member(uuid),public.submit_forecast(uuid,numeric,text),
  public.transition_question(uuid,text),public.resolve_question(uuid,integer,text),public.get_consensus(uuid),
  public.get_leaderboard(),public.get_profile_stats(),public.get_question_participation(),public.create_league(text,text,text),public.join_league(text),public.get_leagues()
  to authenticated;
