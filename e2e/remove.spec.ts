import { expect, test, type Page } from '@playwright/test';
import { request, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { cartServer } from '../src/server.ts';

// The acceptance criteria of DEMO-20 on the server that Playwright starts, but AC4, which starts a server of its own
// cart. AC1–AC9 go through the page, as a buyer does. AC10 and AC11 need an Origin or form fields that the page does
// not send, so they send raw requests with node:http, not fetch: fetch drops a Host it is given (ADR-0001).

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

// Presses the Xóa button of a line, found by its role and its whole name, such as "Xóa Bút bi": the name "Xóa" alone
// matches every button. The form posts to the server for real, so Chrome sends the Origin of the page.
async function remove(page: Page, product: string): Promise<void> {
  await page.getByRole('button', { name: `Xóa ${product}`, exact: true }).click();
  await page.waitForLoadState();
}

// Types a code in the coupon field, found by its label, and presses Áp dụng, found by its role, as in e2e/coupon.spec.ts.
async function apply(page: Page, code: string): Promise<void> {
  await page.getByLabel('Mã giảm giá', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Áp dụng' }).click();
  await page.waitForLoadState();
}

// The cells of a line as shown: name, unit price, quantity, line total and the label of its button.
const BUT_BI = ['Bút bi', '5.000 ₫', '3', '15.000 ₫', 'Xóa'];
const SO_TAY = ['Sổ tay', '12.000 ₫', '2', '24.000 ₫', 'Xóa'];

test.describe('DEMO-20', () => {
  // toHaveText reads the no-break space before ₫ as a space.
  test('AC1 removes Bút bi: only Sổ tay stays, a subtotal of 24.000 ₫, a shipping fee of 3.000 ₫, a total of 27.000 ₫ and no coupon message', async ({ page }) => {
    await page.goto('/');
    await remove(page, 'Bút bi');

    const lines = page.getByTestId('cart-line');
    await expect(lines).toHaveCount(1);
    await expect(lines.getByRole('cell')).toHaveText(SO_TAY);
    await expect(page.getByRole('cell', { name: 'Bút bi' })).toHaveCount(0);
    await expect(page.getByTestId('subtotal')).toHaveText('24.000 ₫');
    await expect(page.getByTestId('shipping')).toHaveText('3.000 ₫');
    await expect(page.getByTestId('total')).toHaveText('27.000 ₫');
    await expect(page.getByTestId('coupon-error')).toHaveCount(0);
  });

  test('AC2 removes Sổ tay: only Bút bi stays, a subtotal of 15.000 ₫, a shipping fee of 3.000 ₫ and a total of 18.000 ₫', async ({ page }) => {
    await page.goto('/');
    await remove(page, 'Sổ tay');

    const lines = page.getByTestId('cart-line');
    await expect(lines).toHaveCount(1);
    await expect(lines.getByRole('cell')).toHaveText(BUT_BI);
    await expect(page.getByTestId('subtotal')).toHaveText('15.000 ₫');
    await expect(page.getByTestId('shipping')).toHaveText('3.000 ₫');
    await expect(page.getByTestId('total')).toHaveText('18.000 ₫');
  });

  test('AC3 removes Sổ tay once Bút bi is gone: the empty cart, without a table, a coupon field, a subtotal, a shipping fee or a total', async ({ page }) => {
    await page.goto('/');
    await remove(page, 'Bút bi');
    await expect(page.getByTestId('cart-line')).toHaveCount(1);
    await remove(page, 'Sổ tay');

    await expect(page.getByTestId('empty-cart')).toHaveText('Giỏ hàng trống.');
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByLabel('Mã giảm giá', { exact: true })).toHaveCount(0);
    for (const id of ['subtotal', 'shipping', 'total']) {
      await expect(page.getByTestId(id), id).toHaveCount(0);
    }
  });

  // A cart over the free shipping threshold, which the sample cart never reaches, on a server of its own (plan of
  // DEMO-20, decision 8). Its URL is 127.0.0.1, so its own Origin passes the check of the server.
  test('AC4 removes Chuột from a cart of 55.000 ₫ with free shipping: a subtotal of 40.000 ₫, a shipping fee of 3.000 ₫ and a total of 43.000 ₫', async ({ page }) => {
    const server = cartServer([
      { id: 'ban-phim', name: 'Bàn phím', price: 40000, quantity: 1 },
      { id: 'chuot', name: 'Chuột', price: 15000, quantity: 1 },
    ]);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
      await expect(page.getByTestId('subtotal')).toHaveText('55.000 ₫');
      await expect(page.getByTestId('shipping')).toHaveText('Miễn phí');
      await expect(page.getByTestId('total')).toHaveText('55.000 ₫');

      await remove(page, 'Chuột');

      await expect(page.getByTestId('cart-line').getByRole('cell')).toHaveText(['Bàn phím', '40.000 ₫', '1', '40.000 ₫', 'Xóa']);
      await expect(page.getByTestId('subtotal')).toHaveText('40.000 ₫');
      await expect(page.getByTestId('shipping')).toHaveText('3.000 ₫');
      await expect(page.getByTestId('total')).toHaveText('43.000 ₫');
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });

  test('AC5 removes Bút bi with GIAM10 in force: a discount of -2.400 ₫, a subtotal of 24.000 ₫, a shipping fee of 3.000 ₫ and a total of 24.600 ₫', async ({ page }) => {
    await page.goto('/');
    await apply(page, 'GIAM10');
    await expect(page.getByTestId('total')).toHaveText('38.100 ₫');
    await remove(page, 'Bút bi');

    await expect(page.getByTestId('cart-line').getByRole('cell')).toHaveText(SO_TAY);
    await expect(page.locator('dt', { hasText: 'Giảm giá (' })).toHaveText('Giảm giá (GIAM10)');
    await expect(page.getByTestId('discount')).toHaveText('-2.400 ₫');
    await expect(page.getByTestId('subtotal')).toHaveText('24.000 ₫');
    await expect(page.getByTestId('shipping')).toHaveText('3.000 ₫');
    await expect(page.getByTestId('total')).toHaveText('24.600 ₫');
  });

  test('AC6 removes Sổ tay with GIAM20K in force: a discount of -15.000 ₫, equal to the subtotal of 15.000 ₫, a shipping fee of 3.000 ₫ and a total of 3.000 ₫', async ({ page }) => {
    await page.goto('/');
    await apply(page, 'GIAM20K');
    await expect(page.getByTestId('total')).toHaveText('22.000 ₫');
    await remove(page, 'Sổ tay');

    await expect(page.getByTestId('cart-line').getByRole('cell')).toHaveText(BUT_BI);
    await expect(page.locator('dt', { hasText: 'Giảm giá (' })).toHaveText('Giảm giá (GIAM20K)');
    await expect(page.getByTestId('discount')).toHaveText('-15.000 ₫');
    await expect(page.getByTestId('subtotal')).toHaveText('15.000 ₫');
    await expect(page.getByTestId('shipping')).toHaveText('3.000 ₫');
    await expect(page.getByTestId('total')).toHaveText('3.000 ₫');
  });

  test('AC7 applies GIAM10 once Bút bi is gone: only Sổ tay stays, a discount of -2.400 ₫ and a total of 24.600 ₫', async ({ page }) => {
    await page.goto('/');
    await remove(page, 'Bút bi');
    await expect(page.getByTestId('cart-line')).toHaveCount(1);
    await apply(page, 'GIAM10');

    await expect(page.getByTestId('discount')).toHaveText('-2.400 ₫');
    await expect(page.getByTestId('cart-line')).toHaveCount(1);
    await expect(page.getByTestId('cart-line').getByRole('cell')).toHaveText(SO_TAY);
    await expect(page.locator('dt', { hasText: 'Giảm giá (' })).toHaveText('Giảm giá (GIAM10)');
    await expect(page.getByTestId('total')).toHaveText('24.600 ₫');
  });

  test('AC8 applies SAIMA once Bút bi is gone: the message of an invalid code, only Sổ tay stays and the total stays 27.000 ₫', async ({ page }) => {
    await page.goto('/');
    await remove(page, 'Bút bi');
    await expect(page.getByTestId('cart-line')).toHaveCount(1);
    await apply(page, 'SAIMA');

    await expect(page.getByTestId('coupon-error')).toHaveText('Mã giảm giá không hợp lệ.');
    await expect(page.getByTestId('cart-line')).toHaveCount(1);
    await expect(page.getByTestId('cart-line').getByRole('cell')).toHaveText(SO_TAY);
    await expect(page.getByTestId('total')).toHaveText('27.000 ₫');
  });

  // Enter sends the form of the field through its first submit button, Áp dụng: no Xóa button is in that form.
  test('AC9 applies GIAM10 with Enter in the coupon field: a total of 38.100 ₫ and both lines stay', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Mã giảm giá', { exact: true }).fill('GIAM10');
    await page.getByLabel('Mã giảm giá', { exact: true }).press('Enter');
    await page.waitForLoadState();

    await expect(page.getByTestId('discount')).toHaveText('-3.900 ₫');
    await expect(page.getByTestId('total')).toHaveText('38.100 ₫');
    const lines = page.getByTestId('cart-line');
    await expect(lines).toHaveCount(2);
    await expect(lines.nth(0).getByRole('cell')).toHaveText(BUT_BI);
    await expect(lines.nth(1).getByRole('cell')).toHaveText(SO_TAY);
  });

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
