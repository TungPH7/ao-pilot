# ao-pilot

Sandbox repository for the ai-orchestrator live tests (Jira space `DEMO`).

- `.ai-orchestrator/`: hand-made copy of the kit, with the contract, the templates, the agent roster and the scripts.
- `.claude/`: the kit hooks, the project settings, the ten agents, the shared rules and the vendored skills.
- `.github/workflows/`: the kit's `CI`, `jira-sync` and `merge-gate`. No workflow deploys: the deployer of the kit on the VPS does (see Deployment).
- `Dockerfile`: the image of the cart server for the deployer of the kit (see Deployment).
- `src/`: a small cart (`cart.ts`), its coupons (`coupon.ts`) and its page, rendered on the server (`page.ts`, `server.ts`).

## The cart server

`GET /` and `HEAD /` return the cart page. `POST /` removes a line or applies a coupon, and returns the page with the lines that stay and the new total.

The server checks every request in this order:

| Step | When | Answer |
|---|---|---|
| 1 | The request does not have exactly one `Host`, equal to `127.0.0.1:<port>`, `localhost:<port>` or the host of `AO_PUBLIC_URL` | 400 `Bad request` |
| 2 | The path is not `/` | 404 `Not found` |
| 3 | `GET` or `HEAD` | 200, the cart page |
| 4 | A method other than `GET`, `HEAD`, `POST` | 405 `Method not allowed`, `Allow: GET, HEAD, POST` |
| 5 | `POST` whose `Origin` is not `http://<Host>`, or the origin of `AO_PUBLIC_URL` for its host, including no `Origin` or `null` | 403 `Forbidden` |
| 6 | `POST` with a body over 1024 bytes, with or without a `Content-Length` | 413 `Payload too large`, `Connection: close` |
| 7 | `POST` | 200, the cart page with the lines that stay and the coupon of the form |

The body of `POST /` is read as `application/x-www-form-urlencoded`, whatever its `Content-Type`:

- `remove`: the id of the line to remove, sent by the "Xóa" button of the line. A body with this field, even empty, is a remove request. Only its first value is read.
- `removed`: the id of a line removed before, once per line, sent back by the page in hidden fields of every form.
- `code`: the code as typed. It is trimmed and upper-cased before it is looked up. A remove request does not read `code`: it shows no message about a code, and keeps the coupon applied before.
- `applied`: the code applied before, sent back by the page in a hidden field. The server checks it against the list again.

The server keeps no state and reads no name, price, quantity or amount from the form: every number comes from the cart of the server. The lines that stay are the lines of that cart whose id is neither `remove` nor one of `removed`. Ids are compared as they are, and an id that is no line of the cart, a repeated one or an empty one is ignored. A code of the list replaces the one applied before; an empty or unknown code keeps it.

Every line of a cart has a fixed id of 1 to 32 characters among `a`–`z`, `0`–`9` and `-`, used by no other line; the lines of the sample cart are `but-bi` and `so-tay`. `cartServer(items)` throws a `RangeError` for a cart that breaks this rule, when the server is made.

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
npm run serve         # the cart page on http://127.0.0.1:3000/ (HOST and PORT change them)
npm run test:e2e      # Playwright E2E tests with the Chrome installed on this machine
```

E2E tests do not run in CI yet. Their names start with the acceptance criterion they cover, such as `AC1 …`.

With `E2E_BASE_URL`, such as `https://pilot-dev.ao.t2g.io.vn`, the tests run against that environment, with basic auth from `E2E_HTTP_USER` and `E2E_HTTP_PASSWORD` when both are set, sent to the origin of `E2E_BASE_URL` only. The trace of a failed test holds that basic auth, so ao-step keeps those traces on this machine and does not attach them to Jira. The tests tagged `@local` send requests a browser cannot send, so they still run on the server Playwright starts on this machine (`playwright.config.ts`).

## Deployment

The deployer of the kit, on the VPS, builds the `Dockerfile` from `.ai-orchestrator/deploy.yaml`, runs one container per environment behind Caddy and smoke-tests it; no GitHub workflow deploys. Caddy keeps HTTPS and basic auth and passes the public `Host` on as is (ADR-0003). The container runs as the user `node`, works with `--cap-drop ALL` and `--security-opt no-new-privileges`, and reads:

| Variable | Default | Meaning |
|---|---|---|
| `HOST` | `127.0.0.1` with `npm run serve`, `0.0.0.0` in the image | The address the server listens on |
| `PORT` | `3000` | The port the server listens on |
| `AO_PUBLIC_URL` | none | The public URL of the environment, such as `https://pilot-dev.ao.t2g.io.vn`: its host and origin are accepted besides the local ones. A value that is not an http or https origin stops the server at start, with exit code 1 and a message that says what is wrong without quoting the value |

On `SIGTERM` (`docker stop`) or `SIGINT` (Ctrl+C) the server stops taking connections, closes the idle ones and exits with 0 once the requests in progress end, so `docker stop` does not wait for its timeout.

A commit pushed straight to `develop`, without a pull request, does not deploy: the deployer refuses it until you read it and name a later head with `/ao-rollback development <sha>`.
