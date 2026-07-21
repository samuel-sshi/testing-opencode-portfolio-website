import { test, expect } from '@playwright/test';

async function loadRatingSubmission(page) {
  await page.goto('/');
  await page.addScriptTag({ path: 'rating-submission.js' });
}

test('rated match submission derives shared placements from final score, progress, and time', async ({ page }) => {
  await loadRatingSubmission(page);
  const submission = await page.evaluate(() => window.FlagQuizRatingSubmission.create({
    matchId: '11111111-1111-4111-8111-111111111111', roomCode: 'ABCD1234',
    players: [
      { profileId: '11111111-1111-4111-8111-111111111112', score: 20, answered: 20, elapsed: 45, finished: true },
      { profileId: '11111111-1111-4111-8111-111111111113', score: 20, answered: 20, elapsed: 45, finished: true },
      { profileId: '11111111-1111-4111-8111-111111111114', score: 18, answered: 20, elapsed: 50, finished: true }
    ]
  }));

  expect(submission).toEqual({
    p_match_id: '11111111-1111-4111-8111-111111111111',
    p_room_code: 'ABCD1234',
    p_participants: [
      { profile_id: '11111111-1111-4111-8111-111111111112', placement: 1, score: 20, answered: 20, elapsed_seconds: 45 },
      { profile_id: '11111111-1111-4111-8111-111111111113', placement: 1, score: 20, answered: 20, elapsed_seconds: 45 },
      { profile_id: '11111111-1111-4111-8111-111111111114', placement: 3, score: 18, answered: 20, elapsed_seconds: 50 }
    ]
  });
});

test('rated match submission excludes leavers when two or more finishers remain', async ({ page }) => {
  await loadRatingSubmission(page);
  const submission = await page.evaluate(() => window.FlagQuizRatingSubmission.create({
    matchId: '11111111-1111-4111-8111-111111111111', roomCode: 'ABCD1234',
    players: [
      { profileId: '11111111-1111-4111-8111-111111111112', score: 20, answered: 20, elapsed: 45, finished: true },
      { profileId: '11111111-1111-4111-8111-111111111113', score: 19, answered: 20, elapsed: 50, finished: true },
      { profileId: '11111111-1111-4111-8111-111111111114', score: 4, answered: 4, elapsed: 12, finished: false }
    ]
  }));

  expect(submission.p_participants).toHaveLength(2);
  expect(submission.p_participants.map((player) => player.profile_id)).not.toContain('11111111-1111-4111-8111-111111111114');
});
