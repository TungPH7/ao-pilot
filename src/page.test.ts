import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCoupon, NO_COUPON } from './coupon.ts';
import { formatMoney, renderCart, type CartItem } from './page.ts';

const items: CartItem[] = [
  { id: 'but-bi', name: 'Bút bi', price: 5000, quantity: 3 },
  { id: 'so-tay', name: 'Sổ tay', price: 12000, quantity: 2 },
];

// The markup of a page, without its head: the style names the selectors of the coupon form whether or not it is there.
const main = (html: string): string => html.slice(html.indexOf('<main>'));

test('money is shown in đồng, the Vietnamese way', () => {
  assert.equal(formatMoney(39000), '39.000\u00a0₫');
  assert.equal(formatMoney(0), '0\u00a0₫');
});

// The four cells of DEMO-10 come first, then a fifth cell that holds the form of the Xóa button (SPEC of DEMO-20, Tests
// that change).
test('each line shows its name, unit price, quantity and line total', () => {
  const html = renderCart(items);
  assert.match(html, /<tr data-testid="cart-line"><td>Bút bi<\/td><td>5\.000\u00a0₫<\/td><td>3<\/td><td>15\.000\u00a0₫<\/td><td><form [^]*?<\/form><\/td><\/tr>/);
  assert.match(html, /<tr data-testid="cart-line"><td>Sổ tay<\/td><td>12\.000\u00a0₫<\/td><td>2<\/td><td>24\.000\u00a0₫<\/td><td><form [^]*?<\/form><\/td><\/tr>/);
});

test('the page shows the subtotal, the shipping fee and the total', () => {
  const html = renderCart(items);
  assert.match(html, /<dd data-testid="subtotal">39\.000\u00a0₫<\/dd>/);
  assert.match(html, /<dd data-testid="shipping">3\.000\u00a0₫<\/dd>/);
  assert.match(html, /<dd data-testid="total">42\.000\u00a0₫<\/dd>/);
});

test('free shipping is shown as such', () => {
  const html = renderCart([{ id: 'balo', name: 'Balo', price: 50000, quantity: 1 }]);
  assert.match(html, /<dd data-testid="shipping">Miễn phí<\/dd>/);
  assert.match(html, /<dd data-testid="total">50\.000\u00a0₫<\/dd>/);
});

test('an empty cart says so, without a table or totals', () => {
  const html = renderCart([]);
  assert.match(html, /<p data-testid="empty-cart">Giỏ hàng trống\.<\/p>/);
  assert.doesNotMatch(html, /<table|data-testid="total"/);
});

test('a product name is escaped, so it cannot add markup to the page', () => {
  const html = renderCart([{ id: 'script', name: '<script>alert("x")</script> & \'y\'', price: 1000, quantity: 1 }]);
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
  const html = renderCart([{ id: 'balo', name: 'Balo', price: 55000, quantity: 1 }], applyCoupon({ code: 'GIAM10', applied: '' }));
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
  // The forms of the Xóa buttons are in the table, so the coupon form is found by its label (SPEC of DEMO-20).
  const label = html.indexOf('<label for="coupon-code">');
  assert.ok(html.indexOf('</table>') < label, 'the form comes after the table');
  assert.ok(html.indexOf('</form>', label) < html.indexOf('<dl>'), 'the form comes before the totals');
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
  const html = renderCart([{ id: 'balo', name: 'Balo', price: 55000, quantity: 1 }], applyCoupon({ code: 'GIAM10', applied: '' }));
  assert.match(html, /<dd data-testid="discount">-5\.500\u00a0₫<\/dd>/);
});

test('a discount of nothing is shown as 0 ₫, without a minus sign', () => {
  const html = renderCart([{ id: 'keo', name: 'Kẹo', price: 5, quantity: 1 }], applyCoupon({ code: 'GIAM10', applied: '' }));
  assert.match(html, /<dt>Giảm giá \(GIAM10\)<\/dt><dd data-testid="discount">0\u00a0₫<\/dd>/);
});

// Every form of the page, the coupon form and the form of each Xóa button, sends the coupon in force once (SPEC of
// DEMO-20, Tests that change).
test('a coupon in force goes back with the form in the hidden field applied', () => {
  const html = renderCart(items, applyCoupon({ code: 'GIAM10', applied: '' }));
  assert.match(html, /<form method="post" action="\/">[^]*<input type="hidden" name="applied" value="GIAM10">[^]*<\/form>/);
  assert.equal(html.match(/name="applied"/g)?.length, html.match(/<form/g)?.length);
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

// The style has one media query, for the table under 30 rem (design of DEMO-20), and it leaves the coupon form alone
// (SPEC of DEMO-20, Tests that change).
test('the style wraps the button under the field when the row is too narrow, without a media query', () => {
  const style = renderCart(items).match(/<style>([^<]*)<\/style>/)?.[1] ?? '';
  assert.match(style, /form\{[^}]*display:flex[^}]*flex-wrap:wrap/);
  assert.match(style, /#coupon-code\{[^}]*flex:1 1 /);
  assert.equal(style.match(/@media/g)?.length, 1);
  const query = style.match(/@media[^{]*\{((?:[^{}]*\{[^}]*\})*)\}/)?.[1];
  assert.ok(query !== undefined, 'the block of the media query is read');
  assert.doesNotMatch(query, /form|#coupon-code/);
});

test('the table is in a frame that scrolls sideways, so the page itself never does', () => {
  const html = renderCart(items);
  assert.match(html, /<div class="scroll"><table>\n[^]*<\/table><\/div>/);
  const style = html.match(/<style>([^<]*)<\/style>/)?.[1] ?? '';
  // position:relative keeps the hidden header of the fifth column inside the frame.
  assert.ok(style.includes('.scroll{overflow-x:auto;position:relative;'), style);
});

test('the frame keeps 3 rem clear at its end, so a Xóa button reached by Tab scrolls fully into sight', () => {
  const style = renderCart(items).match(/<style>([^<]*)<\/style>/)?.[1] ?? '';
  // Chrome scrolls the frame only for a button wholly out of it; at 320 px each button still shows 7 of its 47 px.
  assert.ok(style.includes('.scroll{overflow-x:auto;position:relative;scroll-padding-inline-end:3rem}'), style);
});

test('the style keeps the forms of the Xóa buttons out of the rule of the coupon form, and narrows the page under 30 rem', () => {
  const style = renderCart(items).match(/<style>([^<]*)<\/style>/)?.[1] ?? '';
  assert.ok(style.includes('td form{display:block;margin:0}'), style);
  assert.ok(style.includes('@media (max-width:30rem){body{margin:1rem}th,td{padding:.25rem .5rem}}'), style);
});

test('the header of the fifth column is hidden from sight only, not from screen readers', () => {
  const style = renderCart(items).match(/<style>([^<]*)<\/style>/)?.[1] ?? '';
  const rule = style.match(/\.sr-only\{([^}]*)\}/)?.[1] ?? '';
  assert.match(rule, /position:absolute/);
  assert.match(rule, /width:1px;height:1px/);
  assert.match(rule, /overflow:hidden/);
  assert.doesNotMatch(rule, /display:none|visibility:hidden/);
});

test('the style colours message [5] and gives a refused field a thicker border, so the error is not shown by colour alone', () => {
  const style = renderCart(items).match(/<style>([^<]*)<\/style>/)?.[1] ?? '';
  assert.match(style, /#coupon-error\{[^}]*color:#[0-9a-f]{6}/);
  assert.match(style, /#coupon-code\{[^}]*border:1px solid/);
  assert.match(style, /#coupon-code\[aria-invalid="true"\]\{[^}]*border:2px solid/);
  assert.doesNotMatch(style, /outline:(none|0)/, 'the focus ring of the browser stays');
});

// The row of a line, from its <tr> to its </tr>, found by the name of its product.
const rowOf = (html: string, name: string): string =>
  html.match(new RegExp(`<tr data-testid="cart-line"><td>${name}</td>.*?</tr>`))?.[0] ?? '';

// The coupon form, from its <form to its </form>.
const couponFormOf = (html: string): string => html.match(/<form method="post" action="\/">\n<label for="coupon-code">[^]*?<\/form>/)?.[0] ?? '';

test('each line has one Xóa button named after its product, the submit button of a POST / form of its own', () => {
  const html = renderCart(items);
  assert.match(
    rowOf(html, 'Bút bi'),
    /<td><form method="post" action="\/"><button type="submit" name="remove" value="but-bi" aria-label="Xóa Bút bi">Xóa<\/button><\/form><\/td><\/tr>$/,
  );
  assert.match(
    rowOf(html, 'Sổ tay'),
    /<td><form method="post" action="\/"><button type="submit" name="remove" value="so-tay" aria-label="Xóa Sổ tay">Xóa<\/button><\/form><\/td><\/tr>$/,
  );
  assert.equal(html.match(/name="remove"/g)?.length, 2);
  assert.equal(html.match(/<form method="post" action="\/">/g)?.length, 3, 'a form for each line, and the coupon form');
});

test('the fifth column has a header that only screen readers read: Thao tác', () => {
  const html = renderCart(items);
  assert.match(html, /<th scope="col">Thành tiền<\/th><th scope="col"><span class="sr-only">Thao tác<\/span><\/th><\/tr><\/thead>/);
});

test('a line id and a product name are escaped in the value and the label of the Xóa button', () => {
  const html = renderCart([{ id: '"><b>id</b>', name: '<b>"Bút" & \'bi\'</b>', price: 1000, quantity: 1 }]);
  assert.match(html, /name="remove" value="&#34;&#62;&#60;b&#62;id&#60;\/b&#62;"/);
  assert.match(html, /aria-label="Xóa &#60;b&#62;&#34;Bút&#34; &#38; &#39;bi&#39;&#60;\/b&#62;">Xóa<\/button>/);
  assert.doesNotMatch(html, /<b>/);
});

test('a coupon in force goes with the form of each Xóa button, before the button', () => {
  const html = renderCart(items, applyCoupon({ code: 'GIAM10', applied: '' }));
  for (const [name, id] of [['Bút bi', 'but-bi'], ['Sổ tay', 'so-tay']]) {
    assert.match(
      rowOf(html, name),
      new RegExp(`<form method="post" action="/"><input type="hidden" name="applied" value="GIAM10"><button type="submit" name="remove" value="${id}"`),
      name,
    );
  }
});

// Every form of a page, from its <form to its </form>.
const formsOf = (html: string): string[] => html.match(/<form [^]*?<\/form>/g) ?? [];

test('the lines removed before go back with every form, each id once per form and in order, before the coupon in force', () => {
  const html = renderCart([items[1]], applyCoupon({ code: 'GIAM10', applied: '' }), ['but-bi', 'hop-but']);
  const forms = formsOf(html);
  assert.equal(forms.length, 2, 'the form of the Xóa button of Sổ tay, and the coupon form');
  for (const form of forms) {
    assert.equal(form.match(/<input type="hidden" name="removed" value="but-bi">/g)?.length, 1, form);
    assert.equal(form.match(/<input type="hidden" name="removed" value="hop-but">/g)?.length, 1, form);
  }
  assert.match(
    forms[0],
    /^<form method="post" action="\/"><input type="hidden" name="removed" value="but-bi"><input type="hidden" name="removed" value="hop-but"><input type="hidden" name="applied" value="GIAM10"><button type="submit" name="remove" value="so-tay"/,
  );
  assert.match(
    forms[1],
    /<button type="submit">Áp dụng<\/button>\n<input type="hidden" name="removed" value="but-bi">\n<input type="hidden" name="removed" value="hop-but">\n<input type="hidden" name="applied" value="GIAM10">\n<\/form>$/,
  );
});

test('in the coupon form the lines removed before come after the button and before message [5]', () => {
  const html = renderCart([items[1]], applyCoupon({ code: 'SAIMA', applied: '' }), ['but-bi']);
  assert.match(couponFormOf(html), /<button type="submit">Áp dụng<\/button>\n<input type="hidden" name="removed" value="but-bi">\n<p id="coupon-error"/);
});

test('the id of a line removed before is escaped in its hidden field', () => {
  const html = renderCart(items, NO_COUPON, ['"><b>x</b>']);
  assert.equal(html.match(/<input type="hidden" name="removed" value="&#34;&#62;&#60;b&#62;x&#60;\/b&#62;">/g)?.length, 3);
  assert.doesNotMatch(html, /<b>/);
});

test('an empty cart ignores the lines removed before, as it ignores the coupon', () => {
  assert.equal(renderCart([], applyCoupon({ code: 'GIAM10', applied: '' }), ['but-bi', 'so-tay']), renderCart([]));
});

// Enter in the coupon field sends its form through the first submit button of that form, so a Xóa button there would
// remove a line (SPEC of DEMO-20, Never).
test('the coupon form has no Xóa button, and no button is tied to a form by the attribute form', () => {
  const html = renderCart(items, applyCoupon({ code: 'SAIMA', applied: 'GIAM10' }));
  const form = couponFormOf(html);
  assert.match(form, /<button type="submit">Áp dụng<\/button>/);
  assert.doesNotMatch(form, /name="remove"|Xóa/);
  assert.doesNotMatch(html, /\sform=/);
});
