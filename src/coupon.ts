// The coupons of the cart page: pure functions, with no HTTP and no HTML. Amounts are whole đồng, like src/cart.ts.

// A coupon of the fixed list. value: a percent for 'percent' (10 is 10%), an amount in đồng for 'amount'.
export interface Coupon {
  code: string; // upper case, as shown in line [7]
  kind: 'percent' | 'amount';
  value: number;
}

// GIAM10: 10% of the subtotal; GIAM20K: 20000 đồng. Changing this list is an "Ask first" of the SPEC.
export const COUPONS: readonly Coupon[] = Object.freeze([
  Object.freeze({ code: 'GIAM10', kind: 'percent', value: 10 } as const),
  Object.freeze({ code: 'GIAM20K', kind: 'amount', value: 20000 } as const),
]);

// The coupon whose code equals the text once trimmed and upper-cased, or undefined. Never throws.
export function findCoupon(text: string): Coupon | undefined {
  const code = text.trim().toUpperCase();
  return COUPONS.find((coupon) => coupon.code === code);
}

// The discount of a coupon on a subtotal, in đồng: a percent is rounded down, and the discount is never more than the
// subtotal. Throws a RangeError when the subtotal is not a finite number that is not negative, like total().
export function discount(coupon: Coupon, subtotal: number): number {
  if (!Number.isFinite(subtotal) || subtotal < 0) {
    throw new RangeError(`subtotal must be a finite number that is not negative, got ${subtotal}`);
  }
  const amount = coupon.kind === 'percent' ? Math.floor((subtotal * coupon.value) / 100) : coupon.value;
  return Math.min(subtotal, amount);
}

// The two fields of the coupon form as sent; a missing field is ''.
export interface CouponForm {
  code: string;
  applied: string;
}

// What the page shows about coupons.
export interface CouponState {
  applied: Coupon | null; // the coupon in force: line [7] and the hidden field `applied`
  rejected: { reason: 'empty' | 'invalid'; typed: string } | null; // message [5]; typed goes back into field [3] as is
}

// No coupon and no message: the page of GET / and HEAD /.
export const NO_COUPON: CouponState = Object.freeze({ applied: null, rejected: null });

// The state after the form is sent. A code of the list replaces the applied one. An empty or unknown code keeps the
// applied one, checked against the list like any code, so an applied code that is not in it counts as none.
export function applyCoupon(form: CouponForm): CouponState {
  const typed = findCoupon(form.code);
  if (typed !== undefined) return { applied: typed, rejected: null };
  const reason = form.code.trim() === '' ? 'empty' : 'invalid';
  return { applied: findCoupon(form.applied) ?? null, rejected: { reason, typed: form.code } };
}
