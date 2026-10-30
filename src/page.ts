import { shipping, total, type Line } from './cart.ts';
import { discount, NO_COUPON, type Coupon, type CouponState } from './coupon.ts';

export interface CartItem extends Line {
  name: string;
}

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });

// An amount in đồng, such as "39.000 ₫" (with a no-break space).
export function formatMoney(amount: number): string {
  return money.format(amount);
}

// Every character that could start markup or end an attribute, as a numeric reference.
const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const STYLE = 'body{font-family:system-ui,sans-serif;margin:2rem}table{border-collapse:collapse}th,td{padding:.25rem .75rem;text-align:left}dl{display:grid;grid-template-columns:max-content max-content;gap:.25rem 1rem}';

// The cart page as a whole HTML document: one row per item, then the subtotal, the shipping fee and the total, less
// the discount of the coupon in force. An empty cart ignores the coupon. Throws the RangeError of total() when an item
// has a bad price or quantity.
export function renderCart(items: CartItem[], coupon: CouponState = NO_COUPON): string {
  const body = items.length === 0 ? '<p data-testid="empty-cart">Giỏ hàng trống.</p>' : cartTable(items, coupon);
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Giỏ hàng</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>Giỏ hàng</h1>
${body}
</main>
</body>
</html>
`;
}

// Message [5] for each reason a code is refused, word for word as in the SPEC. It never repeats the code typed.
const MESSAGES: Record<'empty' | 'invalid', string> = {
  empty: 'Vui lòng nhập mã giảm giá.',
  invalid: 'Mã giảm giá không hợp lệ.',
};

// The coupon form of S1: field [3], button [4], and the coupon in force in the hidden field applied, which the server
// checks again. It posts to / as application/x-www-form-urlencoded, the default of a form. The field is not required,
// so the server checks it and every browser shows the same message.
function couponForm(coupon: CouponState): string {
  const { applied, rejected } = coupon;
  // A refused code goes back into the field as typed, and the field points to message [5]; an accepted one does not.
  const field = rejected === null
    ? 'value=""'
    : `value="${escapeHtml(rejected.typed)}" autofocus aria-invalid="true" aria-describedby="coupon-error"`;
  const hidden = applied === null ? '' : `\n<input type="hidden" name="applied" value="${escapeHtml(applied.code)}">`;
  const message = rejected === null ? '' : `\n<p id="coupon-error" data-testid="coupon-error">${MESSAGES[rejected.reason]}</p>`;
  return `<form method="post" action="/">
<label for="coupon-code">Mã giảm giá</label>
<input type="text" id="coupon-code" name="code" maxlength="64" ${field}>
<button type="submit">Áp dụng</button>${hidden}${message}
</form>`;
}

// Line [7] of the coupon in force, as a minus amount. A discount of nothing is "0 ₫", since formatMoney(-0) is "-0 ₫".
function discountLine(coupon: Coupon, off: number): string {
  return `\n<dt>Giảm giá (${escapeHtml(coupon.code)})</dt><dd data-testid="discount">${formatMoney(off === 0 ? 0 : -off)}</dd>`;
}

function cartTable(items: CartItem[], coupon: CouponState): string {
  const rows = items
    .map((item) => `<tr data-testid="cart-line"><td>${escapeHtml(item.name)}</td><td>${formatMoney(item.price)}</td><td>${item.quantity}</td><td>${formatMoney(item.price * item.quantity)}</td></tr>`)
    .join('\n');
  const subtotal = total(items);
  // The shipping fee is reckoned on the subtotal before the discount, so shipping() does not change.
  const fee = shipping(items);
  const off = coupon.applied === null ? 0 : discount(coupon.applied, subtotal);
  return `<table>
<thead><tr><th scope="col">Sản phẩm</th><th scope="col">Đơn giá</th><th scope="col">Số lượng</th><th scope="col">Thành tiền</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
${couponForm(coupon)}
<dl>
<dt>Tạm tính</dt><dd data-testid="subtotal">${formatMoney(subtotal)}</dd>${coupon.applied === null ? '' : discountLine(coupon.applied, off)}
<dt>Phí vận chuyển</dt><dd data-testid="shipping">${fee === 0 ? 'Miễn phí' : formatMoney(fee)}</dd>
<dt>Tổng cộng</dt><dd data-testid="total">${formatMoney(subtotal - off + fee)}</dd>
</dl>`;
}
