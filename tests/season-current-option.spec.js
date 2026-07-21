import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('season selector excludes the active season because Current season already represents it', async () => {
  const app = await readFile('app.js', 'utf8');
  expect(app).toContain(".filter((s) => s.status !== 'active')");
});
