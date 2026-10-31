import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCoupon, NO_COUPON } from './coupon.ts';
import { formatMoney, renderCart, type CartItem } from './page.ts';

const items: CartItem[] = [
  { name: 'Bút bi', price: 5000, quantity: 3 },
  { name: 'Sổ tay', price: 12000, quantity: 2 },
];

// The markup of a page, without its head: the style names the selectors of the coupon form whether or not it is there.
const main = (html: string): string => html.slice(html.indexOf('<main>'));

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
  const html = main(renderCart(items));
  assert.doesNotMatch(html, /autofocus|aria-invalid|aria-describedby/);
  assert.doesNotMatch(html, /type="hidden"|name="applied"/);
  assert.doesNotMatch(html, /data-testid="coupon-error"|data-testid="discount"/);
});

test('an empty cart has no coupon form', () => {
  assert.doesNotMatch(main(renderCart([])), /<form|coupon-code|Áp dụng/);
});

test('a coupon in force shows the discount line [7] with its code and a minus sign, between the subtotal and the shipping fee', () => {
  const html = renderCart(items, applyCoupon({ code: 'GIAM10', applied: '' }));
  assert.match(
    html,
    /<dd data-testid="subtotal">[^<]*<\/dd>\n<dt>Giảm giá \(GIAM10\)<\/dt><dd data-testid="discount">-3\.900\u00a0₫<\/dd>\n<dt>Phí vận chuyển<\/dt>/,
  );
});

test('a new code replaces the coupon in force, so there is only one discount line', () => {
  const html = renderCart(items, applyCoupon({ code: 'GIAM20K', applied: 'GIAM10' }));
  assert.equal(html.match(/data-testid="discount"/g)?.length, 1);
  assert.match(html, /<dt>Giảm giá \(GIAM20K\)<\/dt><dd data-testid="discount">-20\.000\u00a0₫<\/dd>/);
  assert.doesNotMatch(html, /GIAM10/);
});

test('a cart with a subtotal of 55.000 ₫ shows a discount of -5.500 ₫ with GIAM10', () => {
  const html = renderCart([{ name: 'Balo', price: 55000, quantity: 1 }], applyCoupon({ code: 'GIAM10', applied: '' }));
  assert.match(html, /<dd data-testid="discount">-5\.500\u00a0₫<\/dd>/);
});

test('a discount of nothing is shown as 0 ₫, without a minus sign', () => {
  const html = renderCart([{ name: 'Kẹo', price: 5, quantity: 1 }], applyCoupon({ code: 'GIAM10', applied: '' }));
  assert.match(html, /<dt>Giảm giá \(GIAM10\)<\/dt><dd data-testid="discount">0\u00a0₫<\/dd>/);
});

test('a coupon in force goes back with the form in the hidden field applied', () => {
  const html = renderCart(items, applyCoupon({ code: 'GIAM10', applied: '' }));
  assert.match(html, /<form method="post" action="\/">[^]*<input type="hidden" name="applied" value="GIAM10">[^]*<\/form>/);
  assert.equal(html.match(/name="applied"/g)?.length, 1);
});

test('the code of a coupon is escaped in the discount line and in the hidden field', () => {
  const html = renderCart(items, { applied: { code: '"><b>x</b>', kind: 'amount', value: 1000 }, rejected: null });
  assert.match(html, /<dt>Giảm giá \(&#34;&#62;&#60;b&#62;x&#60;\/b&#62;\)<\/dt>/);
  assert.match(html, /<input type="hidden" name="applied" value="&#34;&#62;&#60;b&#62;x&#60;\/b&#62;">/);
  assert.doesNotMatch(html, /<b>/);
});

test('an unknown code shows message [5] in the form and keeps what was typed in the field, pointing to the message', () => {
  const html = renderCart(items, applyCoupon({ code: 'SAIMA', applied: '' }));
  assert.match(html, /<p id="coupon-error" data-testid="coupon-error">Mã giảm giá không hợp lệ\.<\/p>\n<\/form>/);
  assert.match(html, /<input type="text" id="coupon-code" name="code" maxlength="64" value="SAIMA" autofocus aria-invalid="true" aria-describedby="coupon-error">/);
  assert.doesNotMatch(html, /data-testid="discount"/);
});

test('an empty code shows the message that asks for one, and keeps the spaces that were typed', () => {
  const html = renderCart(items, applyCoupon({ code: '   ', applied: '' }));
  assert.match(html, /<p id="coupon-error" data-testid="coupon-error">Vui lòng nhập mã giảm giá\.<\/p>/);
  assert.ok(html.includes('name="code" maxlength="64" value="   " autofocus aria-invalid="true" aria-describedby="coupon-error">'));
});

test('the message does not repeat the code that was typed', () => {
  const html = renderCart(items, applyCoupon({ code: 'SAIMA', applied: '' }));
  assert.match(html, /data-testid="coupon-error">[^<]*<\/p>/);
  assert.doesNotMatch(html.match(/data-testid="coupon-error">([^<]*)<\/p>/)?.[1] ?? '', /SAIMA/);
});

test('a refused code keeps the coupon in force: its discount line and its hidden field stay beside the message', () => {
  const html = renderCart(items, applyCoupon({ code: 'SAIMA', applied: 'GIAM10' }));
  assert.match(html, /data-testid="coupon-error">Mã giảm giá không hợp lệ\.<\/p>/);
  assert.match(html, /<dt>Giảm giá \(GIAM10\)<\/dt><dd data-testid="discount">-3\.900\u00a0₫<\/dd>/);
  assert.match(html, /<input type="hidden" name="applied" value="GIAM10">/);
  assert.match(html, /value="SAIMA" autofocus/);
});

test('a code that was typed is escaped in the value of the field, so it cannot add markup to the page', () => {
  const html = renderCart(items, applyCoupon({ code: '"><b>x</b>', applied: '' }));
  assert.match(html, /name="code" maxlength="64" value="&#34;&#62;&#60;b&#62;x&#60;\/b&#62;" autofocus/);
  assert.match(html, /data-testid="coupon-error">Mã giảm giá không hợp lệ\.<\/p>/);
  assert.doesNotMatch(html, /<b>/);
});

test('an accepted code leaves the field empty and without the error attributes', () => {
  const html = renderCart(items, applyCoupon({ code: 'GIAM10', applied: '' }));
  assert.match(html, /name="code" maxlength="64" value="">/);
  assert.doesNotMatch(main(html), /autofocus|aria-invalid|coupon-error/);
});

test('the style wraps the button under the field when the row is too narrow, without a media query', () => {
  const style = renderCart(items).match(/<style>([^<]*)<\/style>/)?.[1] ?? '';
  assert.match(style, /form\{[^}]*display:flex[^}]*flex-wrap:wrap/);
  assert.match(style, /#coupon-code\{[^}]*flex:1 1 /);
  assert.doesNotMatch(style, /@media/);
});

test('the style colours message [5] and gives a refused field a thicker border, so the error is not shown by colour alone', () => {
  const style = renderCart(items).match(/<style>([^<]*)<\/style>/)?.[1] ?? '';
  assert.match(style, /#coupon-error\{[^}]*color:#[0-9a-f]{6}/);
  assert.match(style, /#coupon-code\{[^}]*border:1px solid/);
  assert.match(style, /#coupon-code\[aria-invalid="true"\]\{[^}]*border:2px solid/);
  assert.doesNotMatch(style, /outline:(none|0)/, 'the focus ring of the browser stays');
});
