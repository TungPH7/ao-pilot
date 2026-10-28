import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// ci-state.txt turns CI red or green, to try jira-sync (tracker-integration T18).
test('ci-state.txt says green', () => {
  assert.equal(readFileSync('ci-state.txt', 'utf8').trim(), 'green');
});
