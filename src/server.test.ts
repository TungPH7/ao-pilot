import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { cartServer, SAMPLE_CART } from './server.ts';

const POLICY = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

// Every request of this file gives up after this many milliseconds, so a server that does not answer fails the test
// instead of hanging it (review of PR #9).
const TIMEOUT = 5000;

// Starts the server on a free port of 127.0.0.1 and stops it after the test, dropping the connections still open.
async function start(t: TestContext) {
  const server = cartServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

// fetch with the timeout of this file.
function send(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT) });
}

// A GET with the request target written as is, such as an absolute URL, which fetch would not send.
function rawGet(url: string, target: string): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const { hostname, port } = new URL(url);
    request({ hostname, port, path: target, signal: AbortSignal.timeout(TIMEOUT) }, (response) => {
      response.resume();
      resolve(response.statusCode);
    })
      .on('error', reject)
      .end();
  });
}

test('the sample cart has two lines with a subtotal under the free shipping threshold', () => {
  assert.equal(SAMPLE_CART.length, 2);
  assert.ok(SAMPLE_CART.reduce((sum, item) => sum + item.price * item.quantity, 0) < 50000);
});

test('GET / returns the cart page as HTML, with a policy that allows no script, base, frame or form elsewhere', async (t) => {
  const url = await start(t);
  const response = await send(`${url}/`);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(response.headers.get('content-security-policy'), POLICY);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const html = await response.text();
  assert.match(html, /<h1>Giỏ hàng<\/h1>/);
  assert.equal(html.match(/data-testid="cart-line"/g)?.length, 2);
  assert.match(html, /<dd data-testid="total">42\.000\u00a0₫<\/dd>/);
});

test('a query string does not change the page', async (t) => {
  const url = await start(t);
  assert.equal(await (await send(`${url}/?x=1`)).text(), await (await send(`${url}/`)).text());
});

test('HEAD / returns the headers without a body', async (t) => {
  const url = await start(t);
  const response = await send(`${url}/`, { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '');
});

test('another path is 404, and another method is 405 with the allowed ones', async (t) => {
  const url = await start(t);
  const missing = await send(`${url}/admin`);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(missing.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(await missing.text(), 'Not found');

  const posted = await send(`${url}/`, { method: 'POST', body: 'x' });
  assert.equal(posted.status, 405);
  assert.equal(posted.headers.get('allow'), 'GET, HEAD');
  assert.equal(posted.headers.get('x-content-type-options'), 'nosniff');
});

// Review of PR #9: `//` made new URL() throw and stop the server, and `//evil.example/` returned the page.
test('a path that only looks like / is 404, and the server keeps answering', async (t) => {
  const url = await start(t);
  for (const path of ['//', '///', '//evil.example/', '//evil.example', '/index.html']) {
    assert.equal((await send(`${url}${path}`)).status, 404, path);
  }
  assert.equal(await rawGet(url, 'http://other.example/'), 404, 'an absolute URL as the request target');
  assert.equal((await send(`${url}/`)).status, 200, 'still running');
});

test('a cart the page cannot show stops the server from being made, not a request', () => {
  assert.throws(() => cartServer([{ name: 'Bút bi', price: -1, quantity: 1 }]), RangeError);
});
