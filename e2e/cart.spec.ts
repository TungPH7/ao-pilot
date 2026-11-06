import { expect, test } from '@playwright/test';

// The acceptance criteria of DEMO-10, on the sample cart of src/server.ts. Since DEMO-20 each line has a fifth cell,
// its Xóa button. toHaveText reads the no-break space before ₫ as a space.

test('AC1 shows the name, unit price, quantity and line total of each line', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('Giỏ hàng');
  const lines = page.getByTestId('cart-line');
  await expect(lines).toHaveCount(2);
  await expect(lines.nth(0).getByRole('cell')).toHaveText(['Bút bi', '5.000 ₫', '3', '15.000 ₫', 'Xóa']);
  await expect(lines.nth(1).getByRole('cell')).toHaveText(['Sổ tay', '12.000 ₫', '2', '24.000 ₫', 'Xóa']);
});

test('AC2 shows the subtotal, a shipping fee of 3.000 ₫ and their sum as the total', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('subtotal')).toHaveText('39.000 ₫');
  await expect(page.getByTestId('shipping')).toHaveText('3.000 ₫');
  await expect(page.getByTestId('total')).toHaveText('42.000 ₫');
});

// DEMO-28. The request is sent here because the policy of the cart page stops Chrome from asking for the icon, so a
// check of the console would pass with or without the fix.
test('DEMO-28 answers /favicon.ico with 204 and no content', async ({ request }) => {
  const favicon = await request.get('/favicon.ico');

  expect(favicon.status()).toBe(204);
  expect(await favicon.body()).toHaveLength(0);
});
