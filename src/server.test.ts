import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { request, type IncomingHttpHeaders } from 'node:http';
import { connect, type AddressInfo } from 'node:net';
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

interface Reply {
  status: number | undefined;
  headers: IncomingHttpHeaders;
  body: string;
}

// A request through node:http with exactly the headers given, as a flat list like rawHeaders, so a name can repeat and
// the client adds no Host of its own. fetch cannot do this: it drops a Host it is given (ADR-0001). A body goes with
// the Content-Length of the headers, or chunked when they have none.
function raw(url: string, options: { method?: string; path?: string; headers?: string[]; body?: string } = {}): Promise<Reply> {
  const { method = 'GET', path = '/', headers = [], body } = options;
  return new Promise((resolve, reject) => {
    const { hostname, port } = new URL(url);
    const sent = request({ hostname, port, method, path, headers, setHost: false, signal: AbortSignal.timeout(TIMEOUT) }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    sent.on('error', reject);
    if (body !== undefined) sent.write(body);
    sent.end();
  });
}

// Bytes written as they are through node:net, for what node:http cannot send, such as HTTP/1.0. Resolves with the whole
// answer once the server closes the connection.
function wire(url: string, text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { hostname, port } = new URL(url);
    const chunks: Buffer[] = [];
    const socket = connect({ host: hostname, port: Number(port) }, () => socket.write(text));
    socket.setTimeout(TIMEOUT, () => socket.destroy(new Error(`no answer in ${TIMEOUT} ms`)));
    socket.on('data', (chunk: Buffer) => chunks.push(chunk));
    socket.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    socket.on('error', reject);
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

// AC11: the server answers only the names it is reached by on this machine, so a page that rebinds its own name to
// 127.0.0.1 cannot read it. The Host is checked before anything else, and compared as is.
test('a Host that is not this server is 400 Bad request, for GET and POST and before the path is looked at', async (t) => {
  const url = await start(t);
  const { port } = new URL(url);
  for (const host of ['evil.example', `evil.example:${port}`, '127.0.0.1', `127.0.0.1:${Number(port) + 1}`, `LOCALHOST:${port}`, `127.0.0.1:${port}.evil.example`]) {
    for (const [method, path] of [['GET', '/'], ['POST', '/'], ['GET', '/admin'], ['PUT', '/']]) {
      const reply = await raw(url, { method, path, headers: ['Host', host, 'Origin', `http://${host}`], body: method === 'POST' ? 'code=GIAM10' : undefined });
      assert.equal(reply.status, 400, `${method} ${path} with Host ${host}`);
      assert.equal(reply.headers['content-type'], 'text/plain; charset=utf-8');
      assert.equal(reply.headers['x-content-type-options'], 'nosniff');
      assert.equal(reply.body, 'Bad request');
    }
  }
});

test('localhost with the port of this server is this server', async (t) => {
  const url = await start(t);
  const reply = await raw(url, { headers: ['Host', `localhost:${new URL(url).port}`] });
  assert.equal(reply.status, 200);
  assert.match(reply.body, /<h1>Giỏ hàng<\/h1>/);
});

test('an HTTP/1.1 request without a Host is 400 Bad request from the server, as text', async (t) => {
  const url = await start(t);
  const reply = await raw(url);
  assert.equal(reply.status, 400);
  assert.equal(reply.headers['content-type'], 'text/plain; charset=utf-8');
  assert.equal(reply.headers['x-content-type-options'], 'nosniff');
  assert.equal(reply.body, 'Bad request');
});

test('an HTTP/1.0 request without a Host is 400 Bad request, even on a path that does not exist', async (t) => {
  const url = await start(t);
  for (const path of ['/', '/admin']) {
    const answer = await wire(url, `GET ${path} HTTP/1.0\r\n\r\n`);
    assert.match(answer, /^HTTP\/1\.1 400 /, path);
    assert.match(answer, /\r\nContent-Type: text\/plain; charset=utf-8\r\n/i);
    assert.match(answer, /\r\nX-Content-Type-Options: nosniff\r\n/i);
    assert.ok(answer.endsWith('\r\n\r\nBad request'), path);
  }
});

test('two Host headers are 400, even when both name this server', async (t) => {
  const url = await start(t);
  const host = new URL(url).host;
  for (const second of [host, 'evil.example']) {
    const reply = await raw(url, { headers: ['Host', host, 'Host', second] });
    assert.equal(reply.status, 400, `second Host ${second}`);
    assert.equal(reply.body, 'Bad request');
  }
});
