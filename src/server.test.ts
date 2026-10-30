import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { cartServer, SAMPLE_CART } from './server.ts';

// Starts the server on a free port of 127.0.0.1 and stops it after the test.
async function start(t: { after: (fn: () => void) => void }) {
  const server = cartServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test('the sample cart has two lines with a subtotal under the free shipping threshold', () => {
  assert.equal(SAMPLE_CART.length, 2);
  assert.ok(SAMPLE_CART.reduce((sum, item) => sum + item.price * item.quantity, 0) < 50000);
});

test('GET / returns the cart page as HTML, with a policy that allows no script', async (t) => {
  const url = await start(t);
  const response = await fetch(`${url}/`);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; style-src 'unsafe-inline'");
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const html = await response.text();
  assert.match(html, /<h1>Giỏ hàng<\/h1>/);
  assert.equal(html.match(/data-testid="cart-line"/g)?.length, 2);
  assert.match(html, /<dd data-testid="total">42\.000\u00a0₫<\/dd>/);
});

test('a query string does not change the page', async (t) => {
  const url = await start(t);
  assert.equal(await (await fetch(`${url}/?x=1`)).text(), await (await fetch(`${url}/`)).text());
});

test('HEAD / returns the headers without a body', async (t) => {
  const url = await start(t);
  const response = await fetch(`${url}/`, { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '');
});

test('another path is 404, and another method is 405 with the allowed ones', async (t) => {
  const url = await start(t);
  const missing = await fetch(`${url}/admin`);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(await missing.text(), 'Not found');

  const posted = await fetch(`${url}/`, { method: 'POST', body: 'x' });
  assert.equal(posted.status, 405);
  assert.equal(posted.headers.get('allow'), 'GET, HEAD');
});
