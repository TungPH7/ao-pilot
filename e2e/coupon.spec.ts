import { expect, test } from '@playwright/test';
import { request, type IncomingHttpHeaders } from 'node:http';

// The acceptance criteria of DEMO-11 on the server that Playwright starts. AC9–AC11 need an Origin, a Host or a body
// that a page in the browser cannot choose, so they send raw requests with node:http, not fetch: fetch drops a Host it
// is given (ADR-0001). AC1–AC8 go through the page.

interface Reply {
  status: number | undefined;
  headers: IncomingHttpHeaders;
  body: string;
}

// A request with exactly the headers given, as a flat list like rawHeaders, and no Host of the client's own. A body
// goes with the Content-Length of the headers, or chunked when they have none.
function raw(baseURL: string, options: { method?: string; headers?: string[]; body?: string } = {}): Promise<Reply> {
  const { method = 'GET', headers = [], body } = options;
  return new Promise((resolve, reject) => {
    const { hostname, port } = new URL(baseURL);
    const sent = request({ hostname, port, method, path: '/', headers, setHost: false, signal: AbortSignal.timeout(5000) }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    sent.on('error', reject);
    if (body !== undefined) sent.write(body);
    sent.end();
  });
}

test.describe('DEMO-11', () => {
  test('AC9 refuses a POST / from another origin or without an Origin with 403, without the cart page', async ({ baseURL }) => {
    const url = baseURL as string;
    const host = new URL(url).host;
    for (const origin of [['Origin', 'http://evil.example'], []]) {
      const reply = await raw(url, { method: 'POST', headers: ['Host', host, ...origin], body: 'code=GIAM10' });
      expect(reply.status, origin.join(' ') || 'no Origin').toBe(403);
      expect(reply.body).toBe('Forbidden');
      expect(reply.body).not.toContain('Giỏ hàng');
    }
  });

  test('AC10 refuses a POST / body over 1.024 bytes with 413, then still answers GET / with 200', async ({ baseURL }) => {
    const url = baseURL as string;
    const own = ['Host', new URL(url).host, 'Origin', url];
    const body = 'code='.padEnd(1025, 'A');
    for (const headers of [[...own, 'Content-Length', String(body.length)], own]) {
      const reply = await raw(url, { method: 'POST', headers, body });
      expect(reply.status, headers.includes('Content-Length') ? 'with Content-Length' : 'chunked').toBe(413);
      expect(reply.body).toBe('Payload too large');
      const page = await raw(url, { headers: ['Host', new URL(url).host] });
      expect(page.status).toBe(200);
      expect(page.body).toContain('<h1>Giỏ hàng</h1>');
    }
  });

  test('AC11 answers GET / and POST / with 400 when the Host is not this server or is missing, without the cart page', async ({ baseURL }) => {
    const url = baseURL as string;
    for (const method of ['GET', 'POST']) {
      for (const host of [['Host', 'evil.example', 'Origin', 'http://evil.example'], ['Origin', url]]) {
        const reply = await raw(url, { method, headers: host, body: method === 'POST' ? 'code=GIAM10' : undefined });
        expect(reply.status, `${method} ${host.join(' ')}`).toBe(400);
        expect(reply.body).toBe('Bad request');
        expect(reply.body).not.toContain('Giỏ hàng');
      }
    }
  });
});
