import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCoupon, NO_COUPON } from './coupon.ts';
import { formatMoney, renderCart, type CartItem } from './page.ts';

const items: CartItem[] = [
  { name: 'Bút bi', price: 5000, quantity: 3 },
  { name: 'Sổ tay', price: 12000, quantity: 2 },
];

test('money is shown in đồng, the Vietnamese way', () => {
  assert.equal(formatMoney(39000), '39.000\u00a0₫');
  assert.equal(formatMoney(0), '0\u00a0₫');
});

test('each line shows its name, unit price, quantity and line total', () => {
  const html = renderCart(items);
  assert.match(html, /<tr data-testid="cart-line"><td>Bút bi<\/td><td>5\.000\u00a0₫<\/td><td>3<\/td><td>15\.000\u00a0₫<\/td><\/tr>/);
  assert.match(html, /<tr data-testid="cart-line"><td>Sổ tay<\/td><td>12\.000\u00a0₫<\/td><td>2<\/td><td>24\.000\u00a0₫<\/td><\/tr>/);
});

test('the page shows the subtotal, the shipping fee and the total', () => {
  const html = renderCart(items);
  assert.match(html, /<dd data-testid="subtotal">39\.000\u00a0₫<\/dd>/);
  assert.match(html, /<dd data-testid="shipping">3\.000\u00a0₫<\/dd>/);
  assert.match(html, /<dd data-testid="total">42\.000\u00a0₫<\/dd>/);
});

test('free shipping is shown as such', () => {
  const html = renderCart([{ name: 'Balo', price: 50000, quantity: 1 }]);
  assert.match(html, /<dd data-testid="shipping">Miễn phí<\/dd>/);
  assert.match(html, /<dd data-testid="total">50\.000\u00a0₫<\/dd>/);
});

test('an empty cart says so, without a table or totals', () => {
  const html = renderCart([]);
  assert.match(html, /<p data-testid="empty-cart">Giỏ hàng trống\.<\/p>/);
  assert.doesNotMatch(html, /<table|data-testid="total"/);
});

test('a product name is escaped, so it cannot add markup to the page', () => {
  const html = renderCart([{ name: '<script>alert("x")</script> & \'y\'', price: 1000, quantity: 1 }]);
  assert.match(html, /<td>&#60;script&#62;alert\(&#34;x&#34;\)&#60;\/script&#62; &#38; &#39;y&#39;<\/td>/);
  assert.doesNotMatch(html, /<script>/);
});

test('the page is a whole HTML document in Vietnamese', () => {
  const html = renderCart(items);
  assert.match(html, /^<!doctype html>\n<html lang="vi">/);
  assert.match(html, /<title>Giỏ hàng<\/title>/);
  assert.match(html, /<h1>Giỏ hàng<\/h1>/);
});

test('a coupon in force is taken off the total, while the subtotal and the shipping fee stay', () => {
  const html = renderCart(items, applyCoupon({ code: 'GIAM10', applied: '' }));
  assert.match(html, /<dd data-testid="subtotal">39\.000\u00a0₫<\/dd>/);
  assert.match(html, /<dd data-testid="shipping">3\.000\u00a0₫<\/dd>/);
  assert.match(html, /<dd data-testid="total">38\.100\u00a0₫<\/dd>/);
  assert.match(renderCart(items, applyCoupon({ code: 'GIAM20K', applied: '' })), /<dd data-testid="total">22\.000\u00a0₫<\/dd>/);
});

test('the shipping fee is reckoned on the subtotal before the discount', () => {
  const html = renderCart([{ name: 'Balo', price: 55000, quantity: 1 }], applyCoupon({ code: 'GIAM10', applied: '' }));
  assert.match(html, /<dd data-testid="shipping">Miễn phí<\/dd>/);
  assert.match(html, /<dd data-testid="total">49\.500\u00a0₫<\/dd>/);
});

test('a code that is refused without a coupon in force leaves the total as it is', () => {
  assert.match(renderCart(items, applyCoupon({ code: 'SAIMA', applied: '' })), /<dd data-testid="total">42\.000\u00a0₫<\/dd>/);
  assert.match(renderCart(items, applyCoupon({ code: '', applied: '' })), /<dd data-testid="total">42\.000\u00a0₫<\/dd>/);
});

test('without a coupon the page is the page of GET /', () => {
  assert.equal(renderCart(items, NO_COUPON), renderCart(items));
});

test('an empty cart has no total to take a coupon off', () => {
  assert.equal(renderCart([], applyCoupon({ code: 'GIAM10', applied: '' })), renderCart([]));
});

test('a cart has a coupon form posting to /, with the labelled field [3] and the button [4], between the table and the totals', () => {
  const html = renderCart(items);
  assert.match(html, /<form method="post" action="\/">/);
  assert.match(html, /<label for="coupon-code">Mã giảm giá<\/label>/);
  assert.match(html, /<input type="text" id="coupon-code" name="code" maxlength="64" value="">/);
  assert.match(html, /<button type="submit">Áp dụng<\/button>/);
  assert.ok(html.indexOf('</table>') < html.indexOf('<form'), 'the form comes after the table');
  assert.ok(html.indexOf('</form>') < html.indexOf('<dl>'), 'the form comes before the totals');
});

test('the coupon field is not required, so the server checks it and every browser shows the same message', () => {
  assert.doesNotMatch(renderCart(items), /required/);
});

test('without a coupon or a message the field has no error attributes and the form has no hidden field', () => {
  const html = renderCart(items);
  assert.doesNotMatch(html, /autofocus|aria-invalid|aria-describedby/);
  assert.doesNotMatch(html, /type="hidden"|name="applied"/);
  assert.doesNotMatch(html, /data-testid="coupon-error"|data-testid="discount"/);
});

test('an empty cart has no coupon form', () => {
  assert.doesNotMatch(renderCart([]), /<form|coupon-code|Áp dụng/);
});
