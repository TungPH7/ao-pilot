import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shipping, total, type Line } from './cart.ts';

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

const badLines: Array<[string, Line[]]> = [
  ['a quantity of 0', [{ price: 100, quantity: 0 }]],
  ['a negative quantity', [{ price: 100, quantity: -1 }]],
  ['a fractional quantity', [{ price: 100, quantity: 1.5 }]],
  ['a NaN quantity', [{ price: 100, quantity: NaN }]],
  ['an Infinity quantity', [{ price: 100, quantity: Infinity }]],
  ['a negative price', [{ price: -1, quantity: 1 }]],
  ['a NaN price', [{ price: NaN, quantity: 1 }]],
  ['an Infinity price', [{ price: Infinity, quantity: 1 }]],
  ['a -Infinity price', [{ price: -Infinity, quantity: 1 }]],
  ['a bad line after a good one', [{ price: 100, quantity: 1 }, { price: 100, quantity: 0 }]],
];

for (const [name, lines] of badLines) {
  test(`total throws a RangeError for ${name}`, () => {
    assert.throws(() => total(lines), RangeError);
  });

  test(`shipping throws a RangeError for ${name}`, () => {
    assert.throws(() => shipping(lines), RangeError);
  });
}

test('a price of 0 is accepted', () => {
  assert.equal(total([{ price: 0, quantity: 1 }]), 0);
});
