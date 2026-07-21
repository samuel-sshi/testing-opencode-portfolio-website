import { test, expect } from '@playwright/test';

async function stubLeaderboardClient(page, leaderboard) {
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js', (route) => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.addInitScript((rows) => {
    window.__leaderboardCalls = [];
    window.supabase = {
      createClient: () => ({
        auth: {
          getSession: async () => ({ data: { session: { user: { id: 'player-1', user_metadata: { username: 'player_one' } } } } }),
          signOut: async () => ({ error: null })
        },
        rpc: async (name, params) => {
          window.__leaderboardCalls.push({ name, params });
          return { data: rows, error: null };
        }
      })
    };
  }, leaderboard);
}

test('public leaderboard renders shared ranks and calls the paginated leaderboard RPC', async ({ page }) => {
  await stubLeaderboardClient(page, [
    { rank: 1, username: 'alpha', elo: 120, games_played: 8, last_played_at: '2026-07-21T10:00:00Z', total_players: 3 },
    { rank: 1, username: 'beta', elo: 120, games_played: 4, last_played_at: '2026-07-20T10:00:00Z', total_players: 3 },
    { rank: 3, username: 'gamma', elo: 80, games_played: 9, last_played_at: null, total_players: 3 }
  ]);

  await page.goto('/');
  await page.getByRole('button', { name: 'Leaderboard' }).click();

  await expect(page.locator('#leaderboard.active')).toBeVisible();
  await expect(page.locator('#leaderboardRows')).toContainText('alpha');
  await expect(page.locator('#leaderboardRows')).toContainText('beta');
  await expect(page.locator('#leaderboardRows')).toContainText('3');
  await expect.poll(() => page.evaluate(() => window.__leaderboardCalls)).toEqual([
    { name: 'get_elo_seasons', params: undefined },
    { name: 'get_elo_leaderboard', params: { p_page: 1, p_page_size: 25 } }
  ]);
});
