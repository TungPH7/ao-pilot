import { expect, test, type Page } from '@playwright/test';
import { request, type IncomingHttpHeaders } from 'node:http';

// The acceptance criteria of DEMO-11 on the server that Playwright starts. AC9–AC11 need an Origin, a Host or a body
// that a page in the browser cannot choose, so they send raw requests with node:http, not fetch: fetch drops a Host it
// is given (ADR-0001). AC1–AC8 go through the page. AC9–AC11 carry the tag @local: their raw requests speak plain
// HTTP without basic auth, so they always run on the local server, also when E2E_BASE_URL names an environment behind
// Caddy (playwright.config.ts).

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

// Types a code in field [3], found by its label, and presses button [4], found by its role, as a buyer does. The form
// posts to the server for real, so Chrome sends the Origin of the page.
async function apply(page: Page, code: string): Promise<void> {
  await page.getByLabel('Mã giảm giá', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Áp dụng' }).click();
  await page.waitForLoadState();
}

test.describe('DEMO-11', () => {
  // toHaveText reads the no-break space before ₫ as a space.
  test('AC1 applies GIAM10: a discount line of -3.900 ₫, the same subtotal and shipping fee, and a total of 38.100 ₫', async ({ page }) => {
    await page.goto('/');
    await apply(page, 'GIAM10');

    await expect(page.locator('dt', { hasText: 'Giảm giá (' })).toHaveText('Giảm giá (GIAM10)');
    await expect(page.getByTestId('discount')).toHaveText('-3.900 ₫');
    await expect(page.getByTestId('subtotal')).toHaveText('39.000 ₫');
    await expect(page.getByTestId('shipping')).toHaveText('3.000 ₫');
    await expect(page.getByTestId('total')).toHaveText('38.100 ₫');
    await expect(page.getByTestId('coupon-error')).toHaveCount(0);
  });

  test('AC2 applies GIAM20K: a discount line of -20.000 ₫ and a total of 22.000 ₫', async ({ page }) => {
    await page.goto('/');
    await apply(page, 'GIAM20K');

    await expect(page.getByTestId('discount')).toHaveText('-20.000 ₫');
    await expect(page.getByTestId('total')).toHaveText('22.000 ₫');
  });

  test('AC3 applies "  giam10  " as GIAM10, trimmed and upper-cased', async ({ page }) => {
    await page.goto('/');
    await apply(page, '  giam10  ');

    await expect(page.locator('dt', { hasText: 'Giảm giá (' })).toHaveText('Giảm giá (GIAM10)');
    await expect(page.getByTestId('discount')).toHaveText('-3.900 ₫');
    await expect(page.getByTestId('total')).toHaveText('38.100 ₫');
  });

  test('AC4 replaces GIAM10 with GIAM20K: one discount line, of GIAM20K, and a total of 22.000 ₫', async ({ page }) => {
    await page.goto('/');
    await apply(page, 'GIAM10');
    await expect(page.getByTestId('total')).toHaveText('38.100 ₫');
    await apply(page, 'GIAM20K');

    await expect(page.getByTestId('discount')).toHaveCount(1);
    await expect(page.locator('dt', { hasText: 'Giảm giá (' })).toHaveText('Giảm giá (GIAM20K)');
    await expect(page.getByTestId('discount')).toHaveText('-20.000 ₫');
    await expect(page.getByTestId('total')).toHaveText('22.000 ₫');
  });

  test('AC5 refuses SAIMA: the message, no discount line, a total of 42.000 ₫, and SAIMA still in the field', async ({ page }) => {
    await page.goto('/');
    await apply(page, 'SAIMA');

    await expect(page.getByTestId('coupon-error')).toHaveText('Mã giảm giá không hợp lệ.');
    await expect(page.getByTestId('discount')).toHaveCount(0);
    await expect(page.getByTestId('total')).toHaveText('42.000 ₫');
    await expect(page.getByLabel('Mã giảm giá', { exact: true })).toHaveValue('SAIMA');
  });

  test('AC6 asks for a code when the field is empty, and keeps a total of 42.000 ₫', async ({ page }) => {
    await page.goto('/');
    await apply(page, '');

    await expect(page.getByTestId('coupon-error')).toHaveText('Vui lòng nhập mã giảm giá.');
    await expect(page.getByTestId('total')).toHaveText('42.000 ₫');
  });

  test('AC7 refuses SAIMA after GIAM10 and keeps GIAM10: the message, -3.900 ₫ and a total of 38.100 ₫', async ({ page }) => {
    await page.goto('/');
    await apply(page, 'GIAM10');
    await expect(page.getByTestId('total')).toHaveText('38.100 ₫');
    await apply(page, 'SAIMA');

    await expect(page.getByTestId('coupon-error')).toHaveText('Mã giảm giá không hợp lệ.');
    await expect(page.locator('dt', { hasText: 'Giảm giá (' })).toHaveText('Giảm giá (GIAM10)');
    await expect(page.getByTestId('discount')).toHaveText('-3.900 ₫');
    await expect(page.getByTestId('total')).toHaveText('38.100 ₫');
  });

  test('AC8 refuses "><b>x</b> and shows it back as text in the field, with no b element on the page', async ({ page }) => {
    await page.goto('/');
    await apply(page, '"><b>x</b>');

    await expect(page.getByTestId('coupon-error')).toHaveText('Mã giảm giá không hợp lệ.');
    await expect(page.getByLabel('Mã giảm giá', { exact: true })).toHaveValue('"><b>x</b>');
    await expect(page.locator('b')).toHaveCount(0);
  });

  test('AC9 refuses a POST / from another origin or without an Origin with 403, without the cart page', { tag: '@local' }, async ({ baseURL }) => {
    const url = baseURL as string;
    const host = new URL(url).host;
    for (const origin of [['Origin', 'http://evil.example'], []]) {
      const reply = await raw(url, { method: 'POST', headers: ['Host', host, ...origin], body: 'code=GIAM10' });
      expect(reply.status, origin.join(' ') || 'no Origin').toBe(403);
      expect(reply.body).toBe('Forbidden');
      expect(reply.body).not.toContain('Giỏ hàng');
    }
  });

  test('AC10 refuses a POST / body over 1.024 bytes with 413, then still answers GET / with 200', { tag: '@local' }, async ({ baseURL }) => {
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

  test('AC11 answers GET / and POST / with 400 when the Host is not this server or is missing, without the cart page', { tag: '@local' }, async ({ baseURL }) => {
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
