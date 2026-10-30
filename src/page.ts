import { shipping, total, type Line } from './cart.ts';
import { discount, NO_COUPON, type CouponState } from './coupon.ts';

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
<dl>
<dt>Tạm tính</dt><dd data-testid="subtotal">${formatMoney(subtotal)}</dd>
<dt>Phí vận chuyển</dt><dd data-testid="shipping">${fee === 0 ? 'Miễn phí' : formatMoney(fee)}</dd>
<dt>Tổng cộng</dt><dd data-testid="total">${formatMoney(subtotal - off + fee)}</dd>
</dl>`;
}
