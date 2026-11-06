import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCoupon, COUPONS, discount, findCoupon, keepCoupon, NO_COUPON, type Coupon } from './coupon.ts';

const GIAM10: Coupon = { code: 'GIAM10', kind: 'percent', value: 10 };
const GIAM20K: Coupon = { code: 'GIAM20K', kind: 'amount', value: 20000 };

test('the list has GIAM10 for 10% of the subtotal and GIAM20K for 20.000 đồng', () => {
  assert.deepEqual(COUPONS, [GIAM10, GIAM20K]);
});

test('a code is found as typed', () => {
  assert.deepEqual(findCoupon('GIAM10'), GIAM10);
  assert.deepEqual(findCoupon('GIAM20K'), GIAM20K);
});

test('a code is trimmed and upper-cased before it is looked up', () => {
  assert.deepEqual(findCoupon('  giam10  '), GIAM10);
  assert.deepEqual(findCoupon('\tGiam20k\n'), GIAM20K);
});

test('a code that is not in the list is not found', () => {
  assert.equal(findCoupon('SAIMA'), undefined);
  assert.equal(findCoupon('GIAM 10'), undefined);
  assert.equal(findCoupon('"><b>x</b>'), undefined);
  assert.equal(findCoupon('�'), undefined, 'a body that was not valid UTF-8');
  assert.equal(findCoupon('GIAM10'.padEnd(65, 'X')), undefined, 'longer than the 64 characters of the field');
});

test('an empty or blank code is not found', () => {
  assert.equal(findCoupon(''), undefined);
  assert.equal(findCoupon('   '), undefined);
});

test('a percent is taken of the subtotal and rounded down to the đồng', () => {
  assert.equal(discount(GIAM10, 39000), 3900);
  assert.equal(discount(GIAM10, 12345), 1234);
  assert.equal(discount(GIAM10, 5), 0);
});

test('an amount is taken off as is, but never more than the subtotal', () => {
  assert.equal(discount(GIAM20K, 39000), 20000);
  assert.equal(discount(GIAM20K, 15000), 15000);
  assert.equal(discount(GIAM20K, 0), 0);
});

test('a subtotal that is negative or not a finite number is a RangeError, like total()', () => {
  for (const subtotal of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => discount(GIAM10, subtotal), RangeError, String(subtotal));
  }
});

test('no coupon is the state of a page that was not sent a form', () => {
  assert.deepEqual(NO_COUPON, { applied: null, rejected: null });
});

test('a code of the list is applied, without a message', () => {
  assert.deepEqual(applyCoupon({ code: 'GIAM10', applied: '' }), { applied: GIAM10, rejected: null });
  assert.deepEqual(applyCoupon({ code: '  giam10  ', applied: '' }), { applied: GIAM10, rejected: null });
});

test('a code of the list replaces the coupon applied before', () => {
  assert.deepEqual(applyCoupon({ code: 'GIAM20K', applied: 'GIAM10' }), { applied: GIAM20K, rejected: null });
});

test('an empty code keeps the coupon applied before and asks for a code, with the field as typed', () => {
  assert.deepEqual(applyCoupon({ code: '', applied: '' }), { applied: null, rejected: { reason: 'empty', typed: '' } });
  assert.deepEqual(applyCoupon({ code: '   ', applied: 'GIAM10' }), { applied: GIAM10, rejected: { reason: 'empty', typed: '   ' } });
});

test('a code that is not in the list keeps the coupon applied before and says it is invalid, with the field as typed', () => {
  assert.deepEqual(applyCoupon({ code: 'SAIMA', applied: '' }), { applied: null, rejected: { reason: 'invalid', typed: 'SAIMA' } });
  assert.deepEqual(applyCoupon({ code: 'SAIMA', applied: 'GIAM10' }), { applied: GIAM10, rejected: { reason: 'invalid', typed: 'SAIMA' } });
  assert.deepEqual(applyCoupon({ code: '"><b>x</b>', applied: '' }), { applied: null, rejected: { reason: 'invalid', typed: '"><b>x</b>' } });
});

test('an applied code that is not in the list counts as no coupon, without a message of its own', () => {
  assert.deepEqual(applyCoupon({ code: 'SAIMA', applied: 'GIAM99' }), { applied: null, rejected: { reason: 'invalid', typed: 'SAIMA' } });
  assert.deepEqual(applyCoupon({ code: 'GIAM10', applied: 'GIAM99' }), { applied: GIAM10, rejected: null });
});

test('the coupons of the list cannot be changed by the code that uses them', () => {
  const applied = applyCoupon({ code: 'GIAM10', applied: '' }).applied;
  assert.ok(applied !== null);
  assert.throws(() => {
    applied.value = 100;
  }, TypeError);
  assert.equal(discount(GIAM10, 39000), 3900);
});

test('a form that sends no code keeps the coupon in force, checked against the list again, without a message', () => {
  assert.deepEqual(keepCoupon('GIAM10'), { applied: GIAM10, rejected: null });
  assert.deepEqual(keepCoupon(' giam10 '), { applied: GIAM10, rejected: null }, 'trimmed and upper-cased');
  assert.deepEqual(keepCoupon('GIAM20K'), { applied: GIAM20K, rejected: null });
});

test('a form that sends no code and no coupon in force, or one that is not in the list, has no coupon and no message', () => {
  for (const applied of ['', '   ', 'GIAM99', 'SAIMA', '"><b>x</b>', '\uFFFD']) {
    assert.deepEqual(keepCoupon(applied), NO_COUPON, JSON.stringify(applied));
  }
});
