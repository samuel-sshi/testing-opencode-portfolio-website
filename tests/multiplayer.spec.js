import { test, expect } from '@playwright/test';

test('home offers room multiplayer only', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /flag quiz/i })).toBeVisible();
  await expect(page.getByLabel('Player name')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create Room' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Join Room' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^play$/i })).toHaveCount(0);
  await expect(page.getByText(/weekly leaderboard/i)).toHaveCount(0);
});

test('host creates a coded lobby', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Player name').fill('Host');
  await page.getByRole('button', { name: 'Create Room' }).click();
  await expect(page.getByText('ROOM CODE')).toBeVisible();
  await expect(page.locator('#roomCodeDisplay')).toHaveText(/^[A-Z0-9]{8}$/);
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeDisabled();
  await expect(page.getByText('Host (Host)')).toBeVisible();
});

test('two players join one room and start the same quiz', async ({ browser }) => {
  test.setTimeout(60_000);
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto('/');
  await host.getByLabel('Player name').fill('Alice');
  await host.getByRole('button', { name: 'Create Room' }).click();
  await expect(host.locator('#roomCodeDisplay')).toHaveText(/^[A-Z0-9]{8}$/);
  const code = await host.locator('#roomCodeDisplay').textContent();

  await guest.goto('/');
  await guest.evaluate(async ({ roomCode }) => {
    const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const publicKey = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const spoofId = crypto.randomUUID();
    const attackerClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    const attacker = attackerClient.channel(`flag-room:${roomCode}`, { config: { presence: { key: spoofId } } });
    await new Promise((resolve) => attacker.subscribe((status) => status === 'SUBSCRIBED' && resolve()));
    await attacker.track({ clientId: spoofId, publicKey, isHost: true, status: 'lobby' });
    window.__hostSpoof = { attackerClient, attacker };
  }, { roomCode: code });
  await guest.getByLabel('Player name').fill('Bob');
  await guest.getByLabel('Room code').fill(code);
  await guest.getByRole('button', { name: 'Join Room' }).click();

  await expect(host.locator('#playersList').getByText('Bob')).toBeVisible();
  await expect(guest.locator('#playersList').getByText('Alice (Host)')).toBeVisible();
  await expect(host.getByRole('button', { name: 'Start Game' })).toBeEnabled();

  await host.getByRole('button', { name: 'Start Game' }).click();
  await expect(host.locator('#quiz.active')).toBeVisible();
  await expect(guest.locator('#quiz.active')).toBeVisible();
  await expect(host.locator('#flagImage')).toHaveAttribute('src', /flagcdn\.com/);
  await expect(guest.locator('#flagImage')).toHaveAttribute('src', await host.locator('#flagImage').getAttribute('src'));
  await expect(host.locator('.option')).toHaveCount(4);
  await expect(guest.locator('.option')).toHaveCount(4);

  await guest.evaluate(async ({ roomCode }) => {
    const attacker = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    const channel = attacker.channel(`flag-room:${roomCode}`, { config: { broadcast: { self: true } } });
    await new Promise((resolve) => channel.subscribe((status) => status === 'SUBSCRIBED' && resolve()));
    await channel.send({ type: 'broadcast', event: 'player_progress', payload: { clientId: 'forged', score: 20, answered: 20, elapsed: 1, finished: true } });
    await channel.send({ type: 'broadcast', event: 'lobby_reset', payload: {} });
    await attacker.removeChannel(channel);
  }, { roomCode: code });
  await guest.waitForTimeout(500);
  await expect(host.locator('#quiz.active')).toBeVisible();
  await expect(guest.locator('#quiz.active')).toBeVisible();
  await expect(host.locator('#liveRanking')).not.toContainText('20/20');

  await host.locator('.option').first().click();
  await expect(host.locator('#quizProgress')).toHaveText('2 / 20');
  const hostRow = host.locator('#liveRanking tbody tr').filter({ hasText: 'Alice' });
  const guestRow = guest.locator('#liveRanking tbody tr').filter({ hasText: 'Alice' });
  await expect(hostRow).toContainText('1/20');
  await expect(guestRow).toContainText('1/20');

  for (let answered = 2; answered <= 20; answered += 1) {
    const firstOption = host.locator('.option').first();
    await expect(firstOption).toBeEnabled();
    await firstOption.click();
    if (answered < 20) {
      await expect(host.locator('#quizProgress')).toHaveText(`${answered + 1} / 20`);
      await host.waitForTimeout(50);
    }
  }
  await expect(host.locator('#results.active')).toBeVisible();
  await expect(host.locator('#finalRanking tbody tr')).toHaveCount(2);
  await expect(host.locator('#finalRanking')).toContainText('Alice');
  await expect(host.locator('#finalRanking')).toContainText('Bob');

  await host.getByRole('button', { name: 'Return Everyone to Lobby' }).click();
  await expect(host.locator('#lobby.active')).toBeVisible();
  await expect(guest.locator('#lobby.active')).toBeVisible();
  await expect(host.getByRole('button', { name: 'Start Game' })).toBeEnabled();

  await hostContext.close();
  await guestContext.close();
});
