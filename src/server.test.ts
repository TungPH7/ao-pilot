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

// The Host and the Origin of a request sent by the page of this server.
const own = (url: string): string[] => ['Host', new URL(url).host, 'Origin', url];

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

  const put = await send(`${url}/`, { method: 'PUT', body: 'x' });
  assert.equal(put.status, 405);
  assert.equal(put.headers.get('allow'), 'GET, HEAD, POST');
  assert.equal(put.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(put.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(await put.text(), 'Method not allowed');
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

// AC9: a form posted by another site carries that site's Origin, so only the page of this server gets its POST read.
test('a POST / from another origin, or without one, is 403 Forbidden and not the page', async (t) => {
  const url = await start(t);
  const { host, port } = new URL(url);
  const origins = [
    ['Origin', 'http://evil.example'],
    [],
    ['Origin', 'null'],
    ['Origin', url, 'Origin', 'http://evil.example'],
    ['Origin', `http://localhost:${port}`],
    ['Origin', `https://${host}`],
    ['Origin', `${url}/`],
  ];
  for (const origin of origins) {
    const reply = await raw(url, { method: 'POST', headers: ['Host', host, ...origin], body: 'code=GIAM10' });
    assert.equal(reply.status, 403, origin.join(' '));
    assert.equal(reply.headers['content-type'], 'text/plain; charset=utf-8');
    assert.equal(reply.headers['x-content-type-options'], 'nosniff');
    assert.equal(reply.body, 'Forbidden');
  }
});

test('the Origin is checked before the body, so a large body from another origin is 403', async (t) => {
  const url = await start(t);
  const body = 'code='.padEnd(5000, 'A');
  const reply = await raw(url, { method: 'POST', headers: ['Host', new URL(url).host, 'Origin', 'http://evil.example', 'Content-Length', String(body.length)], body });
  assert.equal(reply.status, 403);
});

test('a POST / from the page of this server, by either of its names, is answered with the page', async (t) => {
  const url = await start(t);
  const local = `localhost:${new URL(url).port}`;
  for (const headers of [own(url), ['Host', local, 'Origin', `http://${local}`]]) {
    const reply = await raw(url, { method: 'POST', headers, body: 'code=' });
    assert.equal(reply.status, 200, headers.join(' '));
    assert.match(reply.body, /<h1>Giỏ hàng<\/h1>/);
  }
});

// AC10: a coupon is a few dozen bytes, so a body over 1.024 bytes is refused, and the connection is closed rather than
// read to its end.
test('a POST / body over 1.024 bytes with a Content-Length is 413 at once, on a closed connection, and the server still answers', async (t) => {
  const url = await start(t);
  for (const size of [1025, 2000]) {
    const body = 'code='.padEnd(size, 'A');
    const reply = await raw(url, { method: 'POST', headers: [...own(url), 'Content-Length', String(size)], body });
    assert.equal(reply.status, 413, `${size} bytes`);
    assert.equal(reply.headers.connection, 'close');
    assert.equal(reply.headers['content-type'], 'text/plain; charset=utf-8');
    assert.equal(reply.headers['x-content-type-options'], 'nosniff');
    assert.equal(reply.body, 'Payload too large');
    assert.equal((await send(`${url}/`)).status, 200, `GET / after ${size} bytes`);
  }
});

test('a POST / body over 1.024 bytes without a Content-Length is 413 as it is read, and the server still answers', async (t) => {
  const url = await start(t);
  for (const size of [1025, 5000]) {
    const reply = await raw(url, { method: 'POST', headers: own(url), body: 'code='.padEnd(size, 'A') });
    assert.equal(reply.status, 413, `${size} bytes, chunked`);
    assert.equal(reply.headers.connection, 'close');
    assert.equal(reply.body, 'Payload too large');
    assert.equal((await send(`${url}/`)).status, 200, `GET / after ${size} bytes`);
  }
});

test('a POST / body of exactly 1.024 bytes is read, with or without a Content-Length', async (t) => {
  const url = await start(t);
  const body = 'code=GIAM10&pad='.padEnd(1024, 'A');
  assert.equal((await raw(url, { method: 'POST', headers: [...own(url), 'Content-Length', '1024'], body })).status, 200);
  assert.equal((await raw(url, { method: 'POST', headers: own(url), body })).status, 200);
});

test('a client that drops the connection in the middle of the body ends only its own request', async (t) => {
  const url = await start(t);
  const { hostname, port, host } = new URL(url);
  await new Promise<void>((resolve, reject) => {
    const socket = connect({ host: hostname, port: Number(port) }, () => {
      socket.write(`POST / HTTP/1.1\r\nHost: ${host}\r\nOrigin: ${url}\r\nContent-Length: 500\r\n\r\ncode=GIA`, () => socket.destroy());
    });
    socket.on('close', () => resolve());
    socket.on('error', reject);
  });
  // Gives the server a moment to see the connection go before the next request.
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal((await send(`${url}/`)).status, 200);
});

// A POST / of a form body as the page sends it. fetch sends no Origin of its own, so it is set here (ADR-0001).
function post(url: string, body: string, contentType = 'application/x-www-form-urlencoded'): Promise<Response> {
  return send(`${url}/`, { method: 'POST', headers: { Origin: url, 'Content-Type': contentType }, body });
}

// The total of a page, as shown.
const totalOf = (html: string): string | undefined => html.match(/<dd data-testid="total">([^<]*)<\/dd>/)?.[1];

test('POST / with a code of the list answers the page with the discount taken off the total', async (t) => {
  const url = await start(t);
  assert.equal(totalOf(await (await post(url, 'code=GIAM10')).text()), '38.100\u00a0₫');
  assert.equal(totalOf(await (await post(url, 'code=++giam10++')).text()), '38.100\u00a0₫', 'trimmed and upper-cased');
  assert.equal(totalOf(await (await post(url, 'code=GIAM20K')).text()), '22.000\u00a0₫');
  assert.equal(totalOf(await (await post(url, 'code=GIAM20K&applied=GIAM10')).text()), '22.000\u00a0₫', 'replaces the coupon applied before');
});

test('POST / with a code that is refused keeps the total of the coupon applied before, or of none', async (t) => {
  const url = await start(t);
  for (const body of ['code=SAIMA', 'code=', '', 'code=%FF', 'code=%E0%A4%A', 'code=SAIMA&applied=GIAM99', `code=${'A'.repeat(65)}`]) {
    const response = await post(url, body);
    assert.equal(response.status, 200, body);
    assert.equal(totalOf(await response.text()), '42.000\u00a0₫', body);
  }
  assert.equal(totalOf(await (await post(url, 'code=SAIMA&applied=GIAM10')).text()), '38.100\u00a0₫');
  assert.equal(totalOf(await (await post(url, 'code=&applied=GIAM10')).text()), '38.100\u00a0₫');
});

test('POST / takes no amount from the form, only the first value of a field, and not the query string', async (t) => {
  const url = await start(t);
  assert.equal(totalOf(await (await post(url, 'code=SAIMA&total=1&discount=99999&percent=100')).text()), '42.000\u00a0₫');
  assert.equal(totalOf(await (await post(url, 'code=SAIMA&code=GIAM10')).text()), '42.000\u00a0₫');
  const queried = await send(`${url}/?code=GIAM10`, { method: 'POST', headers: { Origin: url }, body: 'code=' });
  assert.equal(totalOf(await queried.text()), '42.000\u00a0₫');
});

test('POST / reads the body as a form whatever its Content-Type', async (t) => {
  const url = await start(t);
  assert.equal(totalOf(await (await post(url, 'code=GIAM10', 'text/plain')).text()), '38.100\u00a0₫');
});

test('the page of POST / has the headers of GET /, and no Referrer-Policy that would make Chrome send Origin: null', async (t) => {
  const url = await start(t);
  const got = await send(`${url}/`);
  const posted = await post(url, 'code=GIAM10');
  assert.equal(posted.status, 200);
  for (const name of ['content-type', 'content-security-policy', 'x-content-type-options']) {
    assert.equal(posted.headers.get(name), got.headers.get(name), name);
  }
  for (const response of [got, posted]) {
    assert.equal(response.headers.get('referrer-policy'), null);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.doesNotMatch(await response.text(), /<meta[^>]+referrer/i);
  }
});
