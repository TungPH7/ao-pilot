import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { checkLineIds, removeLines } from './cart.ts';
import { applyCoupon, keepCoupon } from './coupon.ts';
import { renderCart, type CartItem } from './page.ts';

// The cart the page shows until the cart has a store: two lines, a subtotal of 39.000 ₫, so shipping is charged.
export const SAMPLE_CART: CartItem[] = [
  { id: 'but-bi', name: 'Bút bi', price: 5000, quantity: 3 },
  { id: 'so-tay', name: 'Sổ tay', price: 12000, quantity: 2 },
];

// The page has no script, so the policy allows none; the style is inline. Forms may post only to this server.
const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
};
const TEXT_HEADERS = { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' };

// The public site of the server behind a proxy, from AO_PUBLIC_URL such as https://pilot-dev.ao.t2g.io.vn: the Host the
// proxy passes on as is, and the Origin of the page loaded from it (ADR-0003).
export interface PublicSite {
  host: string;
  origin: string;
}

// The public site of url, which must be an http or https origin with nothing after it but an optional /. A URL that is
// not one throws a RangeError, so a server set up wrong stops at start instead of refusing every request. The message
// says what is wrong and never quotes url, which may hold a user and a password, so the log of the container does not.
export function publicSite(url: string): PublicSite {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new RangeError('AO_PUBLIC_URL is not a URL; it must be an http or https origin, such as https://example.com');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new RangeError('AO_PUBLIC_URL must start with http:// or https://, such as https://example.com');
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new RangeError('AO_PUBLIC_URL must not hold a user or a password: basic auth is the job of the proxy');
  }
  if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') {
    throw new RangeError('AO_PUBLIC_URL must have no path, query or fragment after its host and port, only an optional /');
  }
  return { host: parsed.host, origin: parsed.origin };
}

// True when host is a name of this server on this machine: 127.0.0.1:<port> or localhost:<port>, as is.
const localHost = (host: string | undefined, port: number): boolean => host === `127.0.0.1:${port}` || host === `localhost:${port}`;

// The Host of the request when it names this server, otherwise undefined: exactly one Host header, equal as is to
// 127.0.0.1:<port> or localhost:<port> (AC11, ADR-0001), or to the host of the public site when there is one
// (ADR-0003). Node keeps only the first of several Host headers in request.headers, so they are counted in rawHeaders.
function ownHost(request: IncomingMessage, port: number, site: PublicSite | undefined): string | undefined {
  const count = request.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'host').length;
  const host = request.headers.host;
  return count === 1 && (localHost(host, port) || (site !== undefined && host === site.host)) ? host : undefined;
}

// The Origin a POST must carry for the Host it names: http://<host> for a name of this machine, the origin of the
// public site for its host. A name of this machine wins over a public site with the same host.
function ownOrigin(host: string, port: number, site: PublicSite | undefined): string {
  return !localHost(host, port) && site !== undefined && host === site.host ? site.origin : `http://${host}`;
}

// The cart page at /: GET and HEAD answer the page made once, POST / the page of the lines that stay once the lines
// of its form are removed, with the coupon of its form. The checks run in the order of the plan: a Host that does not
// name this server is 400, before anything else (AC11 of DEMO-11); GET and HEAD /favicon.ico are 204, so a browser logs
// no error for the icon it asks for on its own (DEMO-28); another path is 404; another method 405; a POST
// without the Origin of this server 403, before its body is read (AC9 of DEMO-11); a body over BODY_LIMIT bytes 413
// (AC10 of DEMO-11). The path is the request target up to its query string, read as is: `//` or `//host/` is not /.
// A cart the page cannot show (total() throws a RangeError) fails here and not on a request, and discount() does not
// throw on a subtotal that total() returned. A cart whose lines do not each have an id of their own fails here too
// (checkLineIds() throws a RangeError). With a public site, its Host and its Origin name this server too (ADR-0003).
export function cartServer(items: CartItem[] = SAMPLE_CART, site?: PublicSite): Server {
  checkLineIds(items);
  const page = renderCart(items);
  // requireHostHeader: false lets the server answer an HTTP/1.1 request without a Host with its own 400, as text.
  const server = createServer({ requireHostHeader: false }, (request, response) => {
    const { port } = server.address() as AddressInfo;
    const host = ownHost(request, port, site);
    const path = (request.url ?? '/').split('?', 1)[0];
    if (host === undefined) {
      response.writeHead(400, TEXT_HEADERS).end('Bad request');
    } else if (path === '/favicon.ico' && (request.method === 'GET' || request.method === 'HEAD')) {
      response.writeHead(204).end();
    } else if (path !== '/') {
      response.writeHead(404, TEXT_HEADERS).end('Not found');
    } else if (request.method === 'GET' || request.method === 'HEAD') {
      response.writeHead(200, PAGE_HEADERS).end(request.method === 'HEAD' ? undefined : page);
    } else if (request.method !== 'POST') {
      response.writeHead(405, { ...TEXT_HEADERS, Allow: 'GET, HEAD, POST' }).end('Method not allowed');
    } else if (request.headers.origin !== ownOrigin(host, port, site)) {
      // Two Origin headers reach here joined by a comma, so they are not equal either (AC9).
      response.writeHead(403, TEXT_HEADERS).end('Forbidden');
    } else {
      readBody(
        request,
        (body) => {
          // Any Content-Type is read as a form; bytes that are not UTF-8 become U+FFFD, an unknown code or line id
          // (plan, POST /). Only remove, removed, code and applied are read: every name, price, quantity and amount
          // comes from the server cart (AC11 of DEMO-20).
          const form = new URLSearchParams(body);
          const remove = form.get('remove'); // a remove request whenever the field is there, even empty
          const sent = form.getAll('removed');
          const { kept, removed } = removeLines(items, remove === null ? sent : [...sent, remove]);
          const applied = form.get('applied') ?? '';
          // A remove request reads no code, so it never shows a message about one.
          const coupon = remove === null ? applyCoupon({ code: form.get('code') ?? '', applied }) : keepCoupon(applied);
          response.writeHead(200, PAGE_HEADERS).end(renderCart(kept, coupon, removed));
        },
        // Connection: close lets Node drop the rest of the body instead of reading it to keep the connection (AC10).
        () => response.writeHead(413, { ...TEXT_HEADERS, Connection: 'close' }).end('Payload too large'),
      );
    }
  });
  return server;
}

const BODY_LIMIT = 1024; // bytes of a POST / body

// Calls done with the body, or tooLarge once the body passes BODY_LIMIT bytes, keeping no more than that. A
// Content-Length over the limit is refused before any byte is read. Reads with data and end events, not for await,
// so a client that drops the connection mid-body ends only its own request: the request emits no error without a
// listener, and end never comes.
function readBody(request: IncomingMessage, done: (body: string) => void, tooLarge: () => void): void {
  if (Number(request.headers['content-length'] ?? 0) > BODY_LIMIT) return tooLarge();
  const chunks: Buffer[] = [];
  let size = 0;
  request.on('data', (chunk: Buffer) => {
    if (size > BODY_LIMIT) return;
    size += chunk.length;
    if (size > BODY_LIMIT) {
      chunks.length = 0;
      tooLarge();
    } else {
      chunks.push(chunk);
    }
  });
  request.on('end', () => {
    if (size <= BODY_LIMIT) done(Buffer.concat(chunks).toString('utf8'));
  });
}

// Where npm run serve listens, and the public site it accepts besides the names of this machine.
export interface ServeOptions {
  host: string;
  port: number;
  site: PublicSite | undefined;
}

// The options of npm run serve from env: HOST or 127.0.0.1, so only this machine reaches it by default; PORT or 3000;
// the public site of AO_PUBLIC_URL, the public URL of the environment of a container behind a proxy (ADR-0003). An
// empty HOST or AO_PUBLIC_URL counts as none. An AO_PUBLIC_URL that is not an http or https origin throws the
// RangeError of publicSite(), whose message does not quote it.
export function serveOptions(env: Record<string, string | undefined>): ServeOptions {
  return {
    host: env.HOST || '127.0.0.1',
    port: Number(env.PORT ?? 3000),
    site: env.AO_PUBLIC_URL ? publicSite(env.AO_PUBLIC_URL) : undefined,
  };
}

// The part of process that stopOnSignals() uses, so a test can pass its own.
export interface SignalTarget {
  once(signal: 'SIGTERM' | 'SIGINT', listener: () => void): unknown;
  exit(code: number): void;
}

// On the first SIGTERM or SIGINT, server stops taking connections and closes the idle ones, and once the requests in
// progress end, the process exits with 0. In a container node runs as PID 1, which has no default action on SIGTERM,
// so without this docker stop would wait its 10 seconds and kill it.
export function stopOnSignals(server: Server, target: SignalTarget = process): void {
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    server.close(() => target.exit(0));
  };
  target.once('SIGTERM', stop);
  target.once('SIGINT', stop);
}

// npm run serve, and the CMD of the image. import.meta.main needs Node 24.2 (package.json engines).
if (import.meta.main) {
  let options: ServeOptions | undefined;
  try {
    options = serveOptions(process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'The options of the server are wrong');
    process.exitCode = 1;
  }
  if (options !== undefined) {
    const { host, port, site } = options;
    const server = cartServer(SAMPLE_CART, site).listen(port, host, () => {
      console.log(`Cart page on http://${host}:${port}/${site === undefined ? '' : `, public at ${site.origin}/`}`);
    });
    stopOnSignals(server);
  }
}
