import { expect, test } from '@playwright/test';
import { request, type IncomingHttpHeaders } from 'node:http';

// The acceptance criteria of DEMO-20 on the server that Playwright starts. AC10 and AC11 need an Origin or form fields
// that the page does not send, so they send raw requests with node:http, not fetch: fetch drops a Host it is given
// (ADR-0001).

interface Reply {
  status: number | undefined;
  headers: IncomingHttpHeaders;
  body: string;
}

// A request with exactly the headers given, as a flat list like rawHeaders, and no Host of the client's own. A body
// goes with the Content-Length of the headers, or chunked when they have none. Copied from e2e/coupon.spec.ts, so that
// file does not change (plan of DEMO-20, decision 8).
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

test.describe('DEMO-20', () => {
  test('AC10 refuses a request to remove Bút bi from another origin or without an Origin with 403, without the cart page', async ({ baseURL }) => {
    const url = baseURL as string;
    const host = new URL(url).host;
    for (const origin of [['Origin', 'http://evil.example'], []]) {
      const reply = await raw(url, { method: 'POST', headers: ['Host', host, ...origin], body: 'remove=but-bi' });
      expect(reply.status, origin.join(' ') || 'no Origin').toBe(403);
      expect(reply.body).toBe('Forbidden');
      expect(reply.body).not.toContain('data-testid="cart-line"');
    }
  });

  // The page of the answer is shown in Chrome, so the lines are read as a buyer sees them. toHaveText reads the
  // no-break space before ₫ as a space.
  test('AC11 answers a request to remove an unknown line, with a name, price, quantity and total of its own, with the sample cart as it is', async ({ baseURL, page }) => {
    const url = baseURL as string;
    const reply = await raw(url, {
      method: 'POST',
      headers: ['Host', new URL(url).host, 'Origin', url, 'Content-Type', 'application/x-www-form-urlencoded'],
      body: 'remove=khong-co&name=X&price=1&quantity=99&total=1',
    });
    expect(reply.status).toBe(200);
    await page.setContent(reply.body);

    const lines = page.getByTestId('cart-line');
    await expect(lines).toHaveCount(2);
    for (const [index, [name, price, quantity]] of [['Bút bi', '5.000 ₫', '3'], ['Sổ tay', '12.000 ₫', '2']].entries()) {
      const cells = lines.nth(index).locator('td');
      await expect(cells.nth(0)).toHaveText(name);
      await expect(cells.nth(1)).toHaveText(price);
      await expect(cells.nth(2)).toHaveText(quantity);
    }
    await expect(page.getByTestId('subtotal')).toHaveText('39.000 ₫');
    await expect(page.getByTestId('total')).toHaveText('42.000 ₫');
  });
});
