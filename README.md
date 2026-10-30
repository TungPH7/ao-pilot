# ao-pilot

Sandbox repository for the ai-orchestrator live tests (Jira space `DEMO`).

- `.ai-orchestrator/`: hand-made copy of the kit, with the contract, the templates, the agent roster and the scripts.
- `.claude/`: the kit hooks, the project settings, the ten agents, the shared rules and the vendored skills.
- `.github/workflows/`: the kit's `CI`, `jira-sync`, `merge-gate` and `audit`, and a pretend `Deploy`.
- `src/`: a small cart (`cart.ts`), its coupons (`coupon.ts`) and its page, rendered on the server (`page.ts`, `server.ts`).

## The cart server

`GET /` and `HEAD /` return the cart page. `POST /` applies a coupon and returns the page with the new total.

The server checks every request in this order:

| Step | When | Answer |
|---|---|---|
| 1 | The request does not have exactly one `Host`, equal to `127.0.0.1:<port>` or `localhost:<port>` | 400 `Bad request` |
| 2 | The path is not `/` | 404 `Not found` |
| 3 | `GET` or `HEAD` | 200, the cart page |
| 4 | A method other than `GET`, `HEAD`, `POST` | 405 `Method not allowed`, `Allow: GET, HEAD, POST` |
| 5 | `POST` whose `Origin` is not `http://<Host>`, including no `Origin` or `null` | 403 `Forbidden` |
| 6 | `POST` with a body over 1024 bytes, with or without a `Content-Length` | 413 `Payload too large`, `Connection: close` |
| 7 | `POST` | 200, the cart page with the coupon of the form |

The body of `POST /` is read as `application/x-www-form-urlencoded`, whatever its `Content-Type`:

- `code`: the code as typed. It is trimmed and upper-cased before it is looked up.
- `applied`: the code applied before, sent back by the page in a hidden field. The server checks it against the list again.

The server keeps no state and reads no amount from the form. A code of the list replaces the one applied before; an empty or unknown code keeps it.

The coupons are a fixed list in `src/coupon.ts`:

| Code | Discount |
|---|---|
| `GIAM10` | 10% of the subtotal, rounded down to the đồng |
| `GIAM20K` | 20.000 ₫, never more than the subtotal |

The total is the subtotal, less the discount, plus the shipping fee. The shipping fee is reckoned on the subtotal before the discount.

A client that is not a browser sends its own `Origin` on `POST /`, such as `curl -H 'Origin: http://127.0.0.1:3000' -d code=GIAM10 http://127.0.0.1:3000/`.

## Commands

```
npm test              # unit tests
npm run test:coverage # unit tests with coverage, lcov in coverage/lcov.info
npm run serve         # the cart page on http://127.0.0.1:3000/ (PORT changes the port)
npm run test:e2e      # Playwright E2E tests with the Chrome installed on this machine
```

E2E tests do not run in CI yet. Their names start with the acceptance criterion they cover, such as `AC1 …`.
