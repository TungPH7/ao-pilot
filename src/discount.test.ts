import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discounted, priceList } from './discount.ts';

test('applies a percentage discount', () => {
  assert.equal(discounted(1000, 10), 900);
});

test('lists one price per line', () => {
  assert.equal(priceList([900, 250]), '900\n250');
});
