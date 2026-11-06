import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { request, type IncomingHttpHeaders } from 'node:http';
import { connect, createServer as createNetServer, type AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import type { CartItem } from './page.ts';
import { cartServer, publicSite, SAMPLE_CART, serveOptions, stopOnSignals, type PublicSite } from './server.ts';

const POLICY = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

// Every request of this file gives up after this many milliseconds, so a server that does not answer fails the test
// instead of hanging it (review of PR #9).
const TIMEOUT = 5000;

// Starts the server of items, or of the sample cart, with the public site if one is given, on a free port of 127.0.0.1
// and stops it after the test, dropping the connections still open.
async function start(t: TestContext, items?: CartItem[], site?: PublicSite) {
  const server = cartServer(items, site);
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

// DEMO-28: a browser asks for /favicon.ico on its own, and a 404 there is an error in its console.
test('GET /favicon.ico is 204 with no body and no Content-Type', async (t) => {
  const url = await start(t);
  const response = await send(`${url}/favicon.ico`);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('content-type'), null);
  assert.equal(await response.text(), '');
});

test('HEAD /favicon.ico is 204, like its GET', async (t) => {
  const url = await start(t);
  assert.equal((await send(`${url}/favicon.ico`, { method: 'HEAD' })).status, 204);
});

test('a query string does not change the answer of /favicon.ico', async (t) => {
  const url = await start(t);
  assert.equal((await send(`${url}/favicon.ico?v=2`)).status, 204);
});

test('a path that only looks like /favicon.ico is still 404', async (t) => {
  const url = await start(t);
  for (const path of ['/favicon.ico/', '/favicon.icon', '/FAVICON.ICO', '//favicon.ico', '/static/favicon.ico']) {
    assert.equal((await send(`${url}${path}`)).status, 404, path);
  }
});

test('a POST to /favicon.ico is still 404, as on any path that is not /', async (t) => {
  const url = await start(t);
  assert.equal((await send(`${url}/favicon.ico`, { method: 'POST', body: 'x' })).status, 404);
});

test('a Host that is not this server is 400 on /favicon.ico too', async (t) => {
  const url = await start(t);
  const { status, body } = await raw(url, { path: '/favicon.ico', headers: ['Host', 'evil.example'] });
  assert.equal(status, 400);
  assert.equal(body, 'Bad request');
});

test('a cart the page cannot show stops the server from being made, not a request', () => {
  assert.throws(() => cartServer([{ id: 'but-bi', name: 'Bút bi', price: -1, quantity: 1 }]), RangeError);
});

test('the lines of the sample cart have the fixed ids but-bi and so-tay', () => {
  assert.deepEqual(SAMPLE_CART.map((item) => item.id), ['but-bi', 'so-tay']);
});

test('a cart whose lines do not each have an id of their own stops the server from being made, not a request', () => {
  const twice: CartItem[] = [
    { id: 'but-bi', name: 'Bút bi', price: 5000, quantity: 3 },
    { id: 'but-bi', name: 'Sổ tay', price: 12000, quantity: 2 },
  ];
  assert.throws(() => cartServer(twice), RangeError, 'the same id twice');
  assert.throws(() => cartServer([{ id: '', name: 'Bút bi', price: 5000, quantity: 3 }]), RangeError, 'an empty id');
  assert.throws(() => cartServer([{ id: 'BUT-BI', name: 'Bút bi', price: 5000, quantity: 3 }]), RangeError, 'an id in upper case');
  const noId = { name: 'Bút bi', price: 5000, quantity: 3 } as unknown as CartItem;
  assert.throws(() => cartServer([noId]), RangeError, 'a line without an id, as from a cart written in JavaScript');
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

// ADR-0003: behind Caddy, the server gets the public Host of its environment as is, and the page loaded from it posts
// with the public Origin. AO_PUBLIC_URL names that site; without it, nothing changes.
const PUBLIC_URL = 'https://pilot-dev.ao.t2g.io.vn';
const PUBLIC_HOST = 'pilot-dev.ao.t2g.io.vn';

test('the public site of AO_PUBLIC_URL is its host and its origin, with or without a trailing slash or a port', () => {
  assert.deepEqual(publicSite(PUBLIC_URL), { host: PUBLIC_HOST, origin: PUBLIC_URL });
  assert.deepEqual(publicSite(`${PUBLIC_URL}/`), { host: PUBLIC_HOST, origin: PUBLIC_URL });
  assert.deepEqual(publicSite('https://PILOT-DEV.ao.t2g.io.vn:443'), { host: PUBLIC_HOST, origin: PUBLIC_URL });
  assert.deepEqual(publicSite('http://pilot.example:8080'), { host: 'pilot.example:8080', origin: 'http://pilot.example:8080' });
});

test('an AO_PUBLIC_URL that is not an http or https origin stops the server from being made', () => {
  for (const url of ['', 'pilot-dev.ao.t2g.io.vn', 'ftp://pilot.example', `${PUBLIC_URL}/cart`, `${PUBLIC_URL}/?x=1`, `${PUBLIC_URL}/#top`, 'https://user:pass@pilot.example']) {
    assert.throws(() => publicSite(url), RangeError, url);
  }
});

test('the error of a wrong AO_PUBLIC_URL says what is wrong without quoting the value', () => {
  const reasons: [string, RegExp][] = [
    ['not a url s3cret', /is not a URL/],
    ['ftp://s3cret.example', /must start with http:\/\/ or https:\/\//],
    ['https://user:s3cret@pilot.example', /must not hold a user or a password/],
    ['https://pilot.example/s3cret', /no path, query or fragment/],
    ['https://pilot.example/?s3cret', /no path, query or fragment/],
  ];
  for (const [url, reason] of reasons) {
    assert.throws(
      () => publicSite(url),
      (error: unknown) => error instanceof RangeError && reason.test(error.message) && !error.message.includes('s3cret'),
      url,
    );
  }
});

// What npm run serve reads at start: HOST, PORT and AO_PUBLIC_URL.
test('npm run serve listens on 127.0.0.1:3000 by default, with no public site', () => {
  assert.deepEqual(serveOptions({}), { host: '127.0.0.1', port: 3000, site: undefined });
  assert.deepEqual(serveOptions({ HOST: '', AO_PUBLIC_URL: '' }), { host: '127.0.0.1', port: 3000, site: undefined });
});

test('npm run serve listens on HOST and PORT, and accepts the public site of AO_PUBLIC_URL, when they are set', () => {
  assert.deepEqual(serveOptions({ HOST: '0.0.0.0' }), { host: '0.0.0.0', port: 3000, site: undefined });
  assert.deepEqual(serveOptions({ HOST: '0.0.0.0', PORT: '3100', AO_PUBLIC_URL: `${PUBLIC_URL}/` }), {
    host: '0.0.0.0',
    port: 3100,
    site: { host: PUBLIC_HOST, origin: PUBLIC_URL },
  });
});

test('npm run serve with an AO_PUBLIC_URL that is not an http or https origin throws a RangeError', () => {
  for (const url of ['pilot-dev.ao.t2g.io.vn', 'ftp://pilot.example', `${PUBLIC_URL}/cart`, 'https://user:s3cret@pilot.example']) {
    assert.throws(() => serveOptions({ HOST: '0.0.0.0', AO_PUBLIC_URL: url }), RangeError, url);
  }
});

test('node src/server.ts with a wrong AO_PUBLIC_URL exits with 1 and prints the reason, not the value', { timeout: TIMEOUT }, async () => {
  const env = { ...process.env, HOST: '127.0.0.1', PORT: '0', AO_PUBLIC_URL: 'https://user:s3cret@pilot.example' };
  const { code, stdout, stderr } = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = execFile(process.execPath, [fileURLToPath(new URL('./server.ts', import.meta.url))], { env, timeout: TIMEOUT }, (_error, out, err) =>
      resolve({ code: child.exitCode, stdout: out, stderr: err }),
    );
  });
  assert.equal(code, 1);
  assert.equal(stdout, '');
  assert.match(stderr, /AO_PUBLIC_URL must not hold a user or a password/);
  assert.doesNotMatch(stderr, /s3cret/);
});

// On SIGTERM (docker stop) or SIGINT (Ctrl+C) the server closes and the process exits at once.
test('on SIGTERM or SIGINT the server stops, even with an idle connection open, and the process exits with 0', { timeout: TIMEOUT }, async (t) => {
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    const server = cartServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    // A server that stopOnSignals() did not close must not keep the test file running.
    t.after(() => {
      server.closeAllConnections();
      if (server.listening) server.close();
    });
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const events = new EventEmitter();
    const codes: number[] = [];
    const exited = new Promise<void>((resolve) => {
      stopOnSignals(server, {
        once: (name, listener) => events.once(name, listener),
        exit: (code) => {
          codes.push(code);
          resolve();
        },
      });
    });
    // fetch keeps its connection open after the answer, as a browser does.
    assert.equal((await send(`${url}/`)).status, 200);
    events.emit(signal);
    await exited;
    // A second signal while stopping, or after, does not exit again.
    events.emit(signal === 'SIGTERM' ? 'SIGINT' : 'SIGTERM');
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(codes, [0], signal);
    assert.equal(server.listening, false, signal);
  }
});

test('with AO_PUBLIC_URL, a GET and a POST / from the public site are answered with the page', async (t) => {
  const url = await start(t, undefined, publicSite(PUBLIC_URL));
  const page = await raw(url, { headers: ['Host', PUBLIC_HOST] });
  assert.equal(page.status, 200);
  assert.match(page.body, /<h1>Giỏ hàng<\/h1>/);
  const posted = await raw(url, { method: 'POST', headers: ['Host', PUBLIC_HOST, 'Origin', PUBLIC_URL], body: 'code=GIAM10' });
  assert.equal(posted.status, 200);
  assert.match(posted.body, /data-testid="discount"/);
});

test('with AO_PUBLIC_URL, the names of this machine still work as before', async (t) => {
  const url = await start(t, undefined, publicSite(PUBLIC_URL));
  const local = `localhost:${new URL(url).port}`;
  for (const headers of [own(url), ['Host', local, 'Origin', `http://${local}`]]) {
    const reply = await raw(url, { method: 'POST', headers, body: 'code=' });
    assert.equal(reply.status, 200, headers.join(' '));
  }
});

test('with AO_PUBLIC_URL, another Host is still 400, for GET and POST', async (t) => {
  const url = await start(t, undefined, publicSite(PUBLIC_URL));
  for (const host of ['evil.example', `${PUBLIC_HOST}:443`, `${PUBLIC_HOST}.evil.example`, 'PILOT-DEV.ao.t2g.io.vn', `evil.${PUBLIC_HOST}`]) {
    for (const method of ['GET', 'POST']) {
      const reply = await raw(url, { method, headers: ['Host', host, 'Origin', PUBLIC_URL], body: method === 'POST' ? 'code=GIAM10' : undefined });
      assert.equal(reply.status, 400, `${method} with Host ${host}`);
      assert.equal(reply.body, 'Bad request');
    }
  }
  const twice = await raw(url, { headers: ['Host', PUBLIC_HOST, 'Host', PUBLIC_HOST] });
  assert.equal(twice.status, 400);
});

test('with AO_PUBLIC_URL, a POST / to the public Host from another origin, or without one, is still 403', async (t) => {
  const url = await start(t, undefined, publicSite(PUBLIC_URL));
  const origins = [
    ['Origin', 'http://evil.example'],
    [],
    ['Origin', 'null'],
    ['Origin', `http://${PUBLIC_HOST}`],
    ['Origin', `${PUBLIC_URL}/`],
    ['Origin', url],
    ['Origin', PUBLIC_URL, 'Origin', 'http://evil.example'],
  ];
  for (const origin of origins) {
    const reply = await raw(url, { method: 'POST', headers: ['Host', PUBLIC_HOST, ...origin], body: 'code=GIAM10' });
    assert.equal(reply.status, 403, origin.join(' '));
    assert.equal(reply.body, 'Forbidden');
  }
  // The public Origin goes only with the public Host, not with a name of this machine.
  const crossed = await raw(url, { method: 'POST', headers: ['Host', new URL(url).host, 'Origin', PUBLIC_URL], body: 'code=GIAM10' });
  assert.equal(crossed.status, 403);
});

// A public site whose host is a name of this machine, such as https://localhost:<port>: that Host still takes only the
// Origin http://<Host>, as without a public site.
test('with an AO_PUBLIC_URL on a name of this machine, that Host still takes only the Origin http://<Host>', async (t) => {
  const probe = createNetServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const server = cartServer(SAMPLE_CART, publicSite(`https://localhost:${port}`));
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const url = `http://127.0.0.1:${port}`;
  const local = `localhost:${port}`;
  const plain = await raw(url, { method: 'POST', headers: ['Host', local, 'Origin', `http://${local}`], body: 'code=' });
  assert.equal(plain.status, 200);
  const secure = await raw(url, { method: 'POST', headers: ['Host', local, 'Origin', `https://${local}`], body: 'code=' });
  assert.equal(secure.status, 403);
});

test('without AO_PUBLIC_URL, the public Host is 400 and the public Origin 403', async (t) => {
  const url = await start(t);
  const page = await raw(url, { headers: ['Host', PUBLIC_HOST] });
  assert.equal(page.status, 400);
  const posted = await raw(url, { method: 'POST', headers: ['Host', new URL(url).host, 'Origin', PUBLIC_URL], body: 'code=GIAM10' });
  assert.equal(posted.status, 403);
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

// The text of an element of a page, by its data-testid, as shown.
const shown = (html: string, testid: string): string | undefined => html.match(new RegExp(`data-testid="${testid}">([^<]*)<`))?.[1];

test('POST / with a code of the list answers the page with its discount line and the coupon in the hidden field', async (t) => {
  const url = await start(t);
  const html = await (await post(url, 'code=++giam10++')).text();
  assert.match(html, /<dt>Giảm giá \(GIAM10\)<\/dt>/);
  assert.equal(shown(html, 'discount'), '-3.900\u00a0₫');
  assert.match(html, /<input type="hidden" name="applied" value="GIAM10">/);
  assert.equal(shown(html, 'coupon-error'), undefined);
  const replaced = await (await post(url, 'code=GIAM20K&applied=GIAM10')).text();
  assert.equal(replaced.match(/data-testid="discount"/g)?.length, 1);
  assert.equal(shown(replaced, 'discount'), '-20.000\u00a0₫');
});

test('POST / with a code that is refused answers the page with its message, the code typed and the coupon in force', async (t) => {
  const url = await start(t);
  const invalid = await (await post(url, 'code=SAIMA&applied=GIAM10')).text();
  assert.equal(shown(invalid, 'coupon-error'), 'Mã giảm giá không hợp lệ.');
  assert.match(invalid, /name="code" maxlength="64" value="SAIMA" autofocus aria-invalid="true" aria-describedby="coupon-error">/);
  assert.equal(shown(invalid, 'discount'), '-3.900\u00a0₫');
  const empty = await (await post(url, 'code=')).text();
  assert.equal(shown(empty, 'coupon-error'), 'Vui lòng nhập mã giảm giá.');
  assert.equal(shown(empty, 'discount'), undefined);
  const markup = await (await post(url, `code=${encodeURIComponent('"><b>x</b>')}`)).text();
  assert.equal(shown(markup, 'coupon-error'), 'Mã giảm giá không hợp lệ.');
  assert.match(markup, /value="&#34;&#62;&#60;b&#62;x&#60;\/b&#62;"/);
  assert.doesNotMatch(markup, /<b>/);
});

// The markup of a page, without its head: the style names the selectors of the coupon form whether or not it is there.
const main = (html: string): string => html.slice(html.indexOf('<main>'));

// The first four cells of each line of a page, as shown: name, unit price, quantity and line total.
const linesOf = (html: string): string[][] =>
  [...html.matchAll(/<tr data-testid="cart-line"><td>([^<]*)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td>/g)].map((cells) => cells.slice(1));

const BUT_BI = ['Bút bi', '5.000 ₫', '3', '15.000 ₫'];
const SO_TAY = ['Sổ tay', '12.000 ₫', '2', '24.000 ₫'];

test('POST / with remove=but-bi answers the page of Sổ tay alone, with its totals and no message (DEMO-20 AC1)', async (t) => {
  const url = await start(t);
  const response = await post(url, 'remove=but-bi');
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.deepEqual(linesOf(html), [SO_TAY]);
  assert.equal(shown(html, 'subtotal'), '24.000 ₫');
  assert.equal(shown(html, 'shipping'), '3.000 ₫');
  assert.equal(shown(html, 'total'), '27.000 ₫');
  assert.equal(shown(html, 'discount'), undefined);
  assert.equal(shown(html, 'coupon-error'), undefined);
});

test('POST / with remove=so-tay answers the page of Bút bi alone, with its totals (DEMO-20 AC2)', async (t) => {
  const url = await start(t);
  const html = await (await post(url, 'remove=so-tay')).text();
  assert.deepEqual(linesOf(html), [BUT_BI]);
  assert.equal(shown(html, 'subtotal'), '15.000 ₫');
  assert.equal(shown(html, 'shipping'), '3.000 ₫');
  assert.equal(shown(html, 'total'), '18.000 ₫');
});

test('POST / that removes the last line answers the empty cart, without a table, a coupon form or totals (DEMO-20 AC3)', async (t) => {
  const url = await start(t);
  for (const body of ['removed=but-bi&remove=so-tay', 'applied=GIAM10&removed=but-bi&remove=so-tay']) {
    const html = await (await post(url, body)).text();
    assert.equal(shown(html, 'empty-cart'), 'Giỏ hàng trống.', body);
    assert.doesNotMatch(main(html), /<table|<form|coupon-code|data-testid="(subtotal|shipping|discount|total)"/, body);
  }
});

test('POST / that removes a line under the free shipping threshold charges the shipping fee again (DEMO-20 AC4)', async (t) => {
  const url = await start(t, [
    { id: 'ban-phim', name: 'Bàn phím', price: 40000, quantity: 1 },
    { id: 'chuot', name: 'Chuột', price: 15000, quantity: 1 },
  ]);
  const before = await (await send(`${url}/`)).text();
  assert.equal(shown(before, 'subtotal'), '55.000 ₫');
  assert.equal(shown(before, 'shipping'), 'Miễn phí');
  assert.equal(shown(before, 'total'), '55.000 ₫');
  const html = await (await post(url, 'remove=chuot')).text();
  assert.deepEqual(linesOf(html), [['Bàn phím', '40.000 ₫', '1', '40.000 ₫']]);
  assert.equal(shown(html, 'subtotal'), '40.000 ₫');
  assert.equal(shown(html, 'shipping'), '3.000 ₫');
  assert.equal(shown(html, 'total'), '43.000 ₫');
});

test('POST / that removes a line keeps GIAM10 in force and takes it off the subtotal of the lines that stay (DEMO-20 AC5)', async (t) => {
  const url = await start(t);
  const html = await (await post(url, 'applied=GIAM10&remove=but-bi')).text();
  assert.deepEqual(linesOf(html), [SO_TAY]);
  assert.match(html, /<dt>Giảm giá \(GIAM10\)<\/dt>/);
  assert.equal(shown(html, 'discount'), '-2.400 ₫');
  assert.equal(shown(html, 'subtotal'), '24.000 ₫');
  assert.equal(shown(html, 'shipping'), '3.000 ₫');
  assert.equal(shown(html, 'total'), '24.600 ₫');
  assert.match(html, /<input type="hidden" name="applied" value="GIAM10">/);
  assert.equal(shown(html, 'coupon-error'), undefined);
});

test('POST / that removes a line keeps GIAM20K in force, never more than the subtotal of the lines that stay (DEMO-20 AC6)', async (t) => {
  const url = await start(t);
  const html = await (await post(url, 'applied=GIAM20K&remove=so-tay')).text();
  assert.deepEqual(linesOf(html), [BUT_BI]);
  assert.match(html, /<dt>Giảm giá \(GIAM20K\)<\/dt>/);
  assert.equal(shown(html, 'discount'), '-15.000 ₫');
  assert.equal(shown(html, 'subtotal'), '15.000 ₫');
  assert.equal(shown(html, 'shipping'), '3.000 ₫');
  assert.equal(shown(html, 'total'), '3.000 ₫');
});

test('POST / with a code of the list and a line removed before applies the code to the lines that stay (DEMO-20 AC7)', async (t) => {
  const url = await start(t);
  const html = await (await post(url, 'code=GIAM10&removed=but-bi')).text();
  assert.deepEqual(linesOf(html), [SO_TAY]);
  assert.equal(shown(html, 'discount'), '-2.400 ₫');
  assert.equal(shown(html, 'total'), '24.600 ₫');
  assert.equal(shown(html, 'coupon-error'), undefined);
});

test('POST / with a code that is refused and a line removed before shows the message on the lines that stay (DEMO-20 AC8)', async (t) => {
  const url = await start(t);
  const html = await (await post(url, 'code=SAIMA&removed=but-bi')).text();
  assert.deepEqual(linesOf(html), [SO_TAY]);
  assert.equal(shown(html, 'coupon-error'), 'Mã giảm giá không hợp lệ.');
  assert.equal(shown(html, 'discount'), undefined);
  assert.equal(shown(html, 'total'), '27.000 ₫');
});

test('POST / with a code and no remove field keeps both lines and applies the code (DEMO-20 AC9)', async (t) => {
  const url = await start(t);
  const html = await (await post(url, 'code=GIAM10')).text();
  assert.deepEqual(linesOf(html), [BUT_BI, SO_TAY]);
  assert.equal(shown(html, 'discount'), '-3.900 ₫');
  assert.equal(shown(html, 'total'), '38.100 ₫');
});

test('a remove request reads no code: no message, and the coupon in force stays even beside a code of the list', async (t) => {
  const url = await start(t);
  for (const body of ['remove=but-bi&code=SAIMA', 'remove=but-bi&code=GIAM10', 'remove=but-bi&code=', 'code=GIAM20K&remove=but-bi']) {
    const html = await (await post(url, body)).text();
    assert.deepEqual(linesOf(html), [SO_TAY], body);
    assert.equal(shown(html, 'coupon-error'), undefined, body);
    assert.equal(shown(html, 'discount'), undefined, body);
    assert.equal(shown(html, 'total'), '27.000 ₫', body);
    assert.match(html, /name="code" maxlength="64" value="">/, `${body}: the field is empty`);
  }
  const kept = await (await post(url, 'applied=GIAM10&remove=but-bi&code=GIAM20K')).text();
  assert.equal(shown(kept, 'discount'), '-2.400 ₫', 'GIAM10 stays, GIAM20K is not read');
  assert.equal(shown(kept, 'total'), '24.600 ₫');
});

test('a remove request checks the coupon in force against the list again, so one that is not in it counts as none', async (t) => {
  const url = await start(t);
  const html = await (await post(url, 'applied=GIAM99&remove=but-bi')).text();
  assert.equal(shown(html, 'discount'), undefined);
  assert.equal(shown(html, 'total'), '27.000 ₫');
  assert.doesNotMatch(html, /GIAM99/);
});

test('POST / reads no name, price, quantity or amount from the form, so an unknown line id gives the sample cart as it is (DEMO-20 AC11)', async (t) => {
  const url = await start(t);
  for (const body of ['remove=khong-co&name=X&price=1&quantity=99&total=1', 'remove=khong-co&name=X&price=1&quantity=99&total=1&subtotal=1&shipping=0&discount=99999&id=but-bi']) {
    const response = await post(url, body);
    assert.equal(response.status, 200, body);
    const html = await response.text();
    assert.deepEqual(linesOf(html), [BUT_BI, SO_TAY], body);
    assert.equal(shown(html, 'subtotal'), '39.000 ₫', body);
    assert.equal(shown(html, 'total'), '42.000 ₫', body);
    assert.equal(shown(html, 'coupon-error'), undefined, body);
  }
});

test('a remove request with an unknown, empty or second line id keeps the sample cart, without a message or an error', async (t) => {
  const url = await start(t);
  const bodies = [
    'remove=',
    'remove=khong-co&remove=but-bi', // only the first value of remove is read
    'remove=constructor',
    'remove=__proto__',
    'remove=__proto__&removed=toString&removed=hasOwnProperty',
    'remove=hasOwnProperty&removed=constructor&removed=valueOf',
    'remove=BUT-BI',
    'remove=but-bi+', // "but-bi " is not trimmed
    'remove=%FF', // not UTF-8, so U+FFFD
    `remove=${'a'.repeat(33)}`,
  ];
  for (const body of bodies) {
    const response = await post(url, body);
    assert.equal(response.status, 200, body);
    const html = await response.text();
    assert.deepEqual(linesOf(html), [BUT_BI, SO_TAY], body);
    assert.equal(shown(html, 'total'), '42.000 ₫', body);
    assert.equal(shown(html, 'coupon-error'), undefined, body);
  }
});

test('the coupon form with unknown lines removed before keeps the sample cart, and asks for a code as without them', async (t) => {
  const url = await start(t);
  for (const body of ['code=&removed=toString&removed=hasOwnProperty', 'code=&removed=constructor&removed=__proto__', 'code=&removed=BUT-BI&removed=%FF']) {
    const html = await (await post(url, body)).text();
    assert.deepEqual(linesOf(html), [BUT_BI, SO_TAY], body);
    assert.equal(shown(html, 'total'), '42.000 ₫', body);
    assert.equal(shown(html, 'coupon-error'), 'Vui lòng nhập mã giảm giá.', body);
  }
});

test('lines removed before that repeat or are empty are each taken out once', async (t) => {
  const url = await start(t);
  const html = await (await post(url, 'removed=but-bi&removed=but-bi&removed=&remove=so-tay')).text();
  assert.equal(shown(html, 'empty-cart'), 'Giỏ hàng trống.');
  const once = await (await post(url, 'removed=but-bi&removed=but-bi&removed=&code=')).text();
  assert.deepEqual(linesOf(once), [SO_TAY]);
  assert.equal(shown(once, 'total'), '27.000 ₫');
});

test('a line id sent in the form never reaches the page, whether it is a line of the cart or not', async (t) => {
  const url = await start(t);
  const html = await (await post(url, 'removed=%3Cscript%3E&removed=khong-co&remove=so-tay')).text();
  assert.deepEqual(linesOf(html), [BUT_BI]);
  assert.doesNotMatch(html, /script|khong-co/i);
});

// The page writes back the ids of the lines removed, taken from the server cart: each once, in every form, and never a
// string of the request.
test('every form of the page sends back each line removed once, and no id that is not a line of the cart', async (t) => {
  const url = await start(t);
  const html = await (await post(url, 'removed=but-bi&removed=but-bi&removed=khong-co&removed=%3Cscript%3E&code=')).text();
  const forms = html.match(/<form [^]*?<\/form>/g) ?? [];
  assert.equal(forms.length, 2, 'the form of the Xóa button of Sổ tay, and the coupon form');
  for (const form of forms) {
    assert.equal(form.match(/name="removed" value="but-bi"/g)?.length, 1, form);
  }
  assert.doesNotMatch(html, /khong-co|script/i);
});

test('the same form sent again gives the same page, so a reload after a remove takes out no other line', async (t) => {
  const url = await start(t);
  for (const body of ['applied=GIAM10&remove=but-bi', 'removed=but-bi&code=GIAM20K', 'removed=but-bi&remove=so-tay']) {
    const first = await (await post(url, body)).text();
    const again = await (await post(url, body)).text();
    assert.equal(again, first, body);
  }
  assert.deepEqual(linesOf(await (await send(`${url}/`)).text()), [BUT_BI, SO_TAY], 'GET / still has the sample cart');
});

test('the page of a remove request has the headers of GET /', async (t) => {
  const url = await start(t);
  const got = await send(`${url}/`);
  const removed = await post(url, 'remove=but-bi');
  for (const name of ['content-type', 'content-security-policy', 'x-content-type-options']) {
    assert.equal(removed.headers.get(name), got.headers.get(name), name);
  }
  assert.equal(removed.headers.get('set-cookie'), null);
});

test('the largest body the coupon form of the page sends, 612 bytes, is read', async (t) => {
  const url = await start(t);
  const body = `code=${'%E1%BA%A1'.repeat(64)}&removed=but-bi&applied=GIAM20K`;
  assert.equal(Buffer.byteLength(body), 612);
  const response = await post(url, body);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.deepEqual(linesOf(html), [SO_TAY]);
  assert.equal(shown(html, 'coupon-error'), 'Mã giảm giá không hợp lệ.');
  assert.equal(shown(html, 'discount'), '-20.000 ₫');
  assert.equal(shown(html, 'total'), '7.000 ₫');
});

test('a remove request from another origin, or without one, is 403 Forbidden and not the page (DEMO-20 AC10)', async (t) => {
  const url = await start(t);
  const host = new URL(url).host;
  for (const origin of [['Origin', 'http://evil.example'], [], ['Origin', 'null']]) {
    const reply = await raw(url, { method: 'POST', headers: ['Host', host, ...origin], body: 'remove=but-bi' });
    assert.equal(reply.status, 403, origin.join(' ') || 'no Origin');
    assert.equal(reply.headers['content-type'], 'text/plain; charset=utf-8');
    assert.equal(reply.body, 'Forbidden');
  }
});

test('a remove request from another origin is 403 before its body is read, even over 1.024 bytes (DEMO-20 AC10)', async (t) => {
  const url = await start(t);
  const host = new URL(url).host;
  const body = 'removed=so-tay&remove=but-bi&pad='.padEnd(5000, 'A');
  for (const length of [['Content-Length', String(body.length)], []]) {
    const reply = await raw(url, { method: 'POST', headers: ['Host', host, 'Origin', 'http://evil.example', ...length], body });
    assert.equal(reply.status, 403, length.length === 0 ? 'chunked' : 'with Content-Length');
    assert.equal(reply.body, 'Forbidden');
  }
});
