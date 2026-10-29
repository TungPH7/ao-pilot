import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shipping, total } from './cart.ts';

test('the total adds price times quantity of every line', () => {
  assert.equal(total([{ price: 1500, quantity: 2 }, { price: 250, quantity: 1 }]), 3250);
});

test('an empty cart costs nothing', () => {
  assert.equal(total([]), 0);
});

test('shipping costs 3000 when the total is between 1 and 49999', () => {
  assert.equal(shipping([{ price: 1, quantity: 1 }]), 3000);
  assert.equal(shipping([{ price: 1500, quantity: 2 }, { price: 250, quantity: 1 }]), 3000);
  assert.equal(shipping([{ price: 49999, quantity: 1 }]), 3000);
});

test('shipping is free when the total is 50000 or more', () => {
  assert.equal(shipping([{ price: 50000, quantity: 1 }]), 0);
  assert.equal(shipping([{ price: 25000, quantity: 3 }]), 0);
});

test('shipping of an empty cart is 0', () => {
  assert.equal(shipping([]), 0);
});
