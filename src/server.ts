import { createServer, type Server } from 'node:http';
import { renderCart, type CartItem } from './page.ts';

// The cart the page shows until the cart has a store: two lines, a subtotal of 39.000 ₫, so shipping is charged.
export const SAMPLE_CART: CartItem[] = [
  { name: 'Bút bi', price: 5000, quantity: 3 },
  { name: 'Sổ tay', price: 12000, quantity: 2 },
];

// The page has no script, so the policy allows none; the style is inline. Forms may post only to this server.
const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
};
const TEXT_HEADERS = { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' };

// The cart page at / for GET and HEAD. Any other path is 404, any other method 405. The path is the request target up
// to its query string, read as is: `//` or `//host/` is not /. The page is made once, so a cart it cannot show
// (total() throws a RangeError) fails here and not on a request.
export function cartServer(items: CartItem[] = SAMPLE_CART): Server {
  const page = renderCart(items);
  return createServer((request, response) => {
    const path = (request.url ?? '/').split('?', 1)[0];
    if (path !== '/') {
      response.writeHead(404, TEXT_HEADERS).end('Not found');
    } else if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { ...TEXT_HEADERS, Allow: 'GET, HEAD' }).end('Method not allowed');
    } else {
      response.writeHead(200, PAGE_HEADERS).end(request.method === 'HEAD' ? undefined : page);
    }
  });
}

// npm run serve: only on this machine, on PORT or 3000. import.meta.main needs Node 24.2 (package.json engines).
if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000);
  cartServer().listen(port, '127.0.0.1', () => console.log(`Cart page on http://127.0.0.1:${port}/`));
}
