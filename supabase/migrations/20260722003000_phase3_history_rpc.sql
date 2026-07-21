-- Phase 3: public current and historical leaderboard reads.

create or replace function public.get_elo_seasons()
returns table (id uuid, starts_at timestamptz, ends_at timestamptz, status text)
language sql stable security definer set search_path = public as $$
  select id, starts_at, ends_at, status
  from public.elo_seasons
  where ends_at >= now() - interval '12 months'
  order by starts_at desc;
$$;

create or replace function public.get_elo_season_leaderboard(
  p_season_id uuid,
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (rank bigint, username text, elo integer, games_played integer, last_played_at timestamptz, total_players bigint)
language sql stable security definer set search_path = public as $$
  with safe as (select greatest(1, coalesce(p_page, 1)) page, least(100, greatest(1, coalesce(p_page_size, 25))) size),
  rows as (
    select rank() over(order by elo desc) rank, username, elo, games_played, last_played_at, count(*) over() total_players
    from public.elo_season_profiles where season_id = p_season_id
  )
  select rank, username, elo, games_played, last_played_at, total_players from rows, safe
  order by elo desc, games_played desc, username asc limit (select size from safe) offset ((select page from safe)-1)*(select size from safe);
$$;

grant execute on function public.get_elo_seasons() to anon, authenticated;
grant execute on function public.get_elo_season_leaderboard(uuid, integer, integer) to anon, authenticated;
