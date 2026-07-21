import { test, expect } from '@playwright/test';

async function stubSupabase(page, signUpResult) {
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js', (route) => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.addInitScript((result) => {
    window.__signUpCalls = [];
    window.supabase = {
      createClient: () => ({
        auth: {
          signUp: async (request) => {
            window.__signUpCalls.push(request);
            return result;
          }
        }
      })
    };
  }, signUpResult);
}

test('sign-up submits a canonical username and password to the account service', async ({ page }) => {
  await stubSupabase(page, {
    data: { user: { id: 'user-1' }, session: { access_token: 'test-token' } },
    error: null
  });

  await page.goto('/');
  await page.getByLabel('Username').fill('  Ada_Lovelace  ');
  await page.getByLabel('Password').fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Sign Up' }).click();

  await expect(page.getByText('Account created as ada_lovelace.')).toBeVisible();
  await expect(page.getByLabel('Player name')).toHaveValue('ada_lovelace');
  await expect.poll(() => page.evaluate(() => window.__signUpCalls)).toEqual([{
    email: 'ada_lovelace@players.countryflagquiz.app',
    password: 'correct-horse-battery-staple',
    options: { data: { username: 'ada_lovelace' } }
  }]);
});

test('sign-up reports that an already-registered username is unavailable', async ({ page }) => {
  await stubSupabase(page, {
    data: { user: null, session: null },
    error: { message: 'User already registered' }
  });

  await page.goto('/');
  await page.getByLabel('Username').fill('taken_name');
  await page.getByLabel('Password').fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Sign Up' }).click();

  await expect(page.locator('#signupError')).toHaveText('That username is already taken.');
});

test('sign-up explains when the backend requires unavailable email confirmation', async ({ page }) => {
  await stubSupabase(page, {
    data: { user: { id: 'user-1' }, session: null },
    error: null
  });

  await page.goto('/');
  await page.getByLabel('Username').fill('confirm_needed');
  await page.getByLabel('Password').fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Sign Up' }).click();

  await expect(page.locator('#signupError')).toHaveText('Username-only sign-up requires email confirmation to be disabled in Supabase.');
  await expect(page.getByLabel('Player name')).toHaveValue('');
});

test('sign-up rejects usernames that are not in the supported format', async ({ page }) => {
  await stubSupabase(page, { data: { user: null, session: null }, error: null });

  await page.goto('/');
  await page.getByLabel('Username').fill('not allowed!');
  await page.getByLabel('Password').fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Sign Up' }).click();

  await expect(page.locator('#signupError')).toHaveText('Username must be 3–20 characters using letters, numbers, or underscores.');
  await expect.poll(() => page.evaluate(() => window.__signUpCalls.length)).toBe(0);
});
