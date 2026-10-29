import { test } from 'node:test';
import assert from 'node:assert/strict';
import { total } from './cart.ts';

test('the total adds price times quantity of every line', () => {
  assert.equal(total([{ price: 1500, quantity: 2 }, { price: 250, quantity: 1 }]), 3250);
});

test('an empty cart costs nothing', () => {
  assert.equal(total([]), 0);
});
