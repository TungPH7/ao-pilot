import { shipping, total, type Line } from './cart.ts';
import { discount, NO_COUPON, type Coupon, type CouponState } from './coupon.ts';

export interface CartItem extends Line {
  id: string; // fixed, never the position of the line: the Xóa button and the hidden fields removed carry it
  name: string;
}

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });

// An amount in đồng, such as "39.000 ₫" (with a no-break space).
export function formatMoney(amount: number): string {
  return money.format(amount);
}

// Every character that could start markup or end an attribute, as a numeric reference.
const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

// The coupon form is one flex row that wraps, with no media query: the label takes a line of its own, the field and
// the button share the next one while it is wide enough, and the button goes under the field, which then fills the
// line, when it is not. Message [5] takes its own line. Its colour is the only one the page adds, and a refused field
// also has a thicker border, so the error is not shown by colour alone.
const STYLE = 'body{font-family:system-ui,sans-serif;margin:2rem}table{border-collapse:collapse}th,td{padding:.25rem .75rem;text-align:left}'
  + 'form{display:flex;flex-wrap:wrap;gap:.5rem;max-width:32rem;margin:1rem 0}label,#coupon-error{flex:1 0 100%;margin:0}'
  + 'input,button{font:inherit;padding:.25rem .5rem}#coupon-code{flex:1 1 12rem;min-width:0;border:1px solid}'
  + '#coupon-code[aria-invalid="true"]{border:2px solid #b00020}#coupon-error{color:#b00020}'
  + 'dl{display:grid;grid-template-columns:max-content max-content;gap:.25rem 1rem}';

// The cart page as a whole HTML document: one row per item, then the subtotal, the shipping fee and the total, less
// the discount of the coupon in force. items: the lines that stay, already taken from the server cart. removed: the ids
// of the lines removed before, from the server cart, which every form of the page sends back in hidden fields. An empty
// cart ignores both the coupon and removed. Throws the RangeError of total() when an item has a bad price or quantity.
export function renderCart(items: CartItem[], coupon: CouponState = NO_COUPON, removed: readonly string[] = []): string {
  const body = items.length === 0
    ? '<p data-testid="empty-cart">Giỏ hàng trống.</p>'
    : cartTable(items, coupon, hiddenFields(coupon, removed));
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

// The hidden fields that every form of the page sends: one removed for each line removed before, in that order, then
// the coupon in force in applied, which the server checks again.
function hiddenFields(coupon: CouponState, removed: readonly string[]): string[] {
  const fields = removed.map((id) => `<input type="hidden" name="removed" value="${escapeHtml(id)}">`);
  if (coupon.applied !== null) fields.push(`<input type="hidden" name="applied" value="${escapeHtml(coupon.applied.code)}">`);
  return fields;
}

// The coupon form of S1: field [3], button [4], then the hidden fields, the lines removed before and the coupon in
// force. It posts to / as application/x-www-form-urlencoded, the default of a form. The field is not required, so the
// server checks it and every browser shows the same message.
function couponForm(coupon: CouponState, hidden: readonly string[]): string {
  const { rejected } = coupon;
  // A refused code goes back into the field as typed, and the field points to message [5]; an accepted one does not.
  const field = rejected === null
    ? 'value=""'
    : `value="${escapeHtml(rejected.typed)}" autofocus aria-invalid="true" aria-describedby="coupon-error"`;
  const fields = hidden.map((input) => `\n${input}`).join('');
  const message = rejected === null ? '' : `\n<p id="coupon-error" data-testid="coupon-error">${MESSAGES[rejected.reason]}</p>`;
  return `<form method="post" action="/">
<label for="coupon-code">Mã giảm giá</label>
<input type="text" id="coupon-code" name="code" maxlength="64" ${field}>
<button type="submit">Áp dụng</button>${fields}${message}
</form>`;
}

// The form of the Xóa button of a line: a POST / form of its own, never the coupon form, since Enter in the coupon field
// sends its form through the first submit button of that form. It sends the id of the line with the hidden fields,
// never the coupon field, a name, a price or an amount. The label names the product, so a screen reader tells the
// buttons apart, and starts with the word shown.
function removeForm(item: CartItem, hidden: readonly string[]): string {
  return `<form method="post" action="/">${hidden.join('')}<button type="submit" name="remove" value="${escapeHtml(item.id)}" aria-label="Xóa ${escapeHtml(item.name)}">Xóa</button></form>`;
}

// Line [7] of the coupon in force, as a minus amount. A discount of nothing is "0 ₫", since formatMoney(-0) is "-0 ₫".
function discountLine(coupon: Coupon, off: number): string {
  return `\n<dt>Giảm giá (${escapeHtml(coupon.code)})</dt><dd data-testid="discount">${formatMoney(off === 0 ? 0 : -off)}</dd>`;
}

function cartTable(items: CartItem[], coupon: CouponState, hidden: readonly string[]): string {
  const rows = items
    .map((item) => `<tr data-testid="cart-line"><td>${escapeHtml(item.name)}</td><td>${formatMoney(item.price)}</td><td>${item.quantity}</td><td>${formatMoney(item.price * item.quantity)}</td><td>${removeForm(item, hidden)}</td></tr>`)
    .join('\n');
  const subtotal = total(items);
  // The shipping fee is reckoned on the subtotal before the discount, so shipping() does not change.
  const fee = shipping(items);
  const off = coupon.applied === null ? 0 : discount(coupon.applied, subtotal);
  return `<table>
<thead><tr><th scope="col">Sản phẩm</th><th scope="col">Đơn giá</th><th scope="col">Số lượng</th><th scope="col">Thành tiền</th><th scope="col"><span class="sr-only">Thao tác</span></th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
${couponForm(coupon, hidden)}
<dl>
<dt>Tạm tính</dt><dd data-testid="subtotal">${formatMoney(subtotal)}</dd>${coupon.applied === null ? '' : discountLine(coupon.applied, off)}
<dt>Phí vận chuyển</dt><dd data-testid="shipping">${fee === 0 ? 'Miễn phí' : formatMoney(fee)}</dd>
<dt>Tổng cộng</dt><dd data-testid="total">${formatMoney(subtotal - off + fee)}</dd>
</dl>`;
}
