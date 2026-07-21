-- Phase 2: atomically apply one casual, host-reported Elo result.
-- This is intentionally idempotent: the same match ID returns its saved result.

create or replace function public.finalize_casual_elo_match(
  p_match_id uuid,
  p_room_code text,
  p_participants jsonb
)
returns table (profile_id uuid, elo_before integer, elo_change integer, elo_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submitter uuid := auth.uid();
  v_player record;
  v_opponent record;
  v_total numeric;
  v_expected numeric;
  v_actual numeric;
  v_change integer;
  v_new_elo integer;
  v_count integer;
begin
  if v_submitter is null then raise exception 'Authentication is required.'; end if;
  if p_room_code !~ '^[A-Z0-9]{8}$' then raise exception 'Invalid room code.'; end if;
  if jsonb_typeof(p_participants) <> 'array' then raise exception 'Participants are required.'; end if;

  if exists (select 1 from public.elo_matches where id = p_match_id) then
    return query select mp.profile_id, mp.elo_before, mp.elo_change, mp.elo_after
      from public.elo_match_participants mp where mp.match_id = p_match_id order by mp.placement, mp.profile_id;
    return;
  end if;

  create temporary table rated_entries (
    profile_id uuid primary key,
    placement integer not null,
    score integer not null,
    answered integer not null,
    elapsed_seconds integer not null,
    elo_before integer not null
  ) on commit drop;

  -- Locks prevent concurrent finalization from reading stale ratings.
  perform 1
    from public.profiles pr
    join jsonb_to_recordset(p_participants) as p(profile_id uuid, placement integer, score integer, answered integer, elapsed_seconds integer)
      on p.profile_id = pr.id
    order by pr.id
    for update;

  insert into rated_entries (profile_id, placement, score, answered, elapsed_seconds, elo_before)
  select p.profile_id, p.placement, p.score, p.answered, p.elapsed_seconds, pr.elo
  from jsonb_to_recordset(p_participants) as p(profile_id uuid, placement integer, score integer, answered integer, elapsed_seconds integer)
  join public.profiles pr on pr.id = p.profile_id
  where p.placement >= 1 and p.score >= 0 and p.answered >= 0 and p.elapsed_seconds >= 0;

  select count(*) into v_count from rated_entries;
  if v_count < 2 or v_count <> jsonb_array_length(p_participants) then
    raise exception 'At least two valid, unique participants are required.';
  end if;
  if not exists (select 1 from rated_entries where profile_id = v_submitter) then
    raise exception 'The submitting host must be a participant.';
  end if;

  -- Locks prevent concurrent finalization from reading stale ratings.
  perform 1 from public.profiles pr join rated_entries e on e.profile_id = pr.id order by pr.id for update;

  insert into public.elo_matches (id, room_code, submitted_by, status, rating_applied_at)
  values (p_match_id, p_room_code, v_submitter, 'finalized', now());

  for v_player in select * from rated_entries order by profile_id loop
    v_total := 0;
    for v_opponent in select * from rated_entries where profile_id <> v_player.profile_id loop
      v_expected := 1 / (1 + power(10::numeric, (v_opponent.elo_before - v_player.elo_before) / 400.0));
      v_actual := case when v_player.placement < v_opponent.placement then 1 when v_player.placement > v_opponent.placement then 0 else 0.5 end;
      v_total := v_total + v_actual - v_expected;
    end loop;
    -- floor(x + .5) matches JavaScript Math.round, including negative values.
    v_change := floor((24 * v_total / (v_count - 1)) + 0.5)::integer;
    v_new_elo := greatest(0, v_player.elo_before + v_change);
    v_change := v_new_elo - v_player.elo_before;

    update public.profiles set elo = v_new_elo, games_played = games_played + 1, last_played_at = now()
      where id = v_player.profile_id;
    insert into public.elo_match_participants (match_id, profile_id, placement, score, answered, elapsed_seconds, elo_before, elo_change, elo_after)
      values (p_match_id, v_player.profile_id, v_player.placement, v_player.score, v_player.answered, v_player.elapsed_seconds, v_player.elo_before, v_change, v_new_elo);
  end loop;

  return query select mp.profile_id, mp.elo_before, mp.elo_change, mp.elo_after
    from public.elo_match_participants mp where mp.match_id = p_match_id order by mp.placement, mp.profile_id;
end;
$$;

grant execute on function public.finalize_casual_elo_match(uuid, text, jsonb) to authenticated;
