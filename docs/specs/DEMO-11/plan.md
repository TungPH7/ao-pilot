# Implementation Plan: Mã giảm giá cho giỏ hàng

> **Epic:** DEMO-11 · **Jira:** https://phunghuutung12b4.atlassian.net/browse/DEMO-11 · **Spec:** [spec.md](spec.md) · **Tasks:** tracked in Jira under DEMO-11

## Overview

Epic giao một Story Jira, gồm AC1–AC11 và màn hình S1 của [design.md](design.md). Story chia hai Sub-task, cùng commit lên nhánh của Story: Sub-task BE làm trước, rồi tới Sub-task FE.

- Sub-task BE làm phần server:
  - danh sách mã và cách tính giảm (`src/coupon.ts`);
  - `POST /` với các bước kiểm `Host`, `Origin` và cỡ body;
  - công thức tổng cộng có trừ giảm giá;
  - hai finding Low của reviewer trên PR #9.

  Khi BE xong, `POST /` đã tính đúng tổng cộng và AC9–AC11 đã pass, dù trang chưa có form.
- Sub-task FE làm phần trang: form [3] [4], thông báo [5], dòng giảm giá [7], bố cục, và E2E của AC1–AC8.

PR của Story chỉ mở khi cả hai Sub-task đã xong.

## Architecture Decisions

1. **Một Story, không tách Task.**
   - SPEC đã chốt gom ba user story vào một Story, gồm Sub-task BE rồi Sub-task FE.
   - `work-items.yaml` chỉ cho tách Task với phần nền dùng chung cho nhiều Story. Epic này chỉ có một Story, nên các phần kỹ thuật (timeout của test, `package-lock.json`) nằm trong Sub-task BE.
   - Test mới của BE cần timeout ngay từ đầu, nên phần timeout là bước đầu tiên của BE.
2. **Ba lớp, mỗi lớp một việc:**
   - `src/coupon.ts` (mới) chỉ có hàm thuần: danh sách mã, chuẩn hóa mã, tính số tiền giảm, chọn mã được áp. File này không biết HTTP hay HTML.
   - `src/server.ts` lo phần HTTP: kiểm `Host`, `Origin` và cỡ body, đọc form, gọi `applyCoupon`, trả trang.
   - `src/page.ts` dựng HTML từ giỏ hàng và một `CouponState`, và giữ câu chữ của [5]. File này không chứa quy tắc mã nào.

   Lý do: logic của mã được unit test mà không cần server. Hai Sub-task làm việc với nhau qua kiểu `CouponState` ở mục API Contract.
3. **Server không lưu trạng thái, và các bước kiểm có thứ tự.**
   - Mã đang áp đi kèm form trong trường ẩn `applied`, và server kiểm lại mã đó ở mỗi request.
   - `Host` được kiểm trước mọi bước khác; `Origin` được kiểm trước khi đọc body.
   - Chi tiết ở [ADR-0001](../../adr/0001-host-and-origin-checks-for-post.md). ADR đang ở Proposed và chuyển sang Accepted khi plan qua gate ②.
4. **Đọc body, và đóng kết nối sau 413.** SPEC để plan chốt phần này.
   - `Content-Length` lớn hơn 1.024 thì server trả 413 ngay, không đọc body.
   - Không có `Content-Length` thì server đọc body bằng sự kiện `data` và `end`, không dùng `for await`. Tới byte thứ 1.025, server bỏ phần đã gom, trả 413, và bỏ qua phần còn lại.
   - Câu trả lời 413 có header `Connection: close`, để Node đóng kết nối chứ không đọc hết phần body còn lại.

   Tôi chạy một prototype trên Node 24.17.0 ngày 2026-10-31:
   - Có `Connection: close`: `fetch` và `node:http` đều nhận 413, cả khi body có `Content-Length` (2.000 byte, 5 MB) lẫn khi body gửi chunked. `GET /` gửi sau đó nhận 200. Server giữ tối đa 1.024 byte body trong bộ nhớ.
   - Không có `Connection: close`: client vẫn nhận 413, nhưng Node đọc rồi bỏ toàn bộ body 5 MB để dùng lại kết nối.
   - Client chỉ gửi 8 trong 500 byte body đã khai báo rồi ngắt kết nối: server vẫn trả 200 cho `GET /` gửi sau đó.
5. **`POST /` không kiểm `Content-Type`.**
   - Server luôn đọc body bằng `URLSearchParams`, như `application/x-www-form-urlencoded`.
   - Lý do: lớp chống CSRF là bước kiểm `Origin`, và form của trang luôn gửi dạng này. Body dạng khác cho `code` rỗng, và trang hiện "Vui lòng nhập mã giảm giá.".
   - Plan không thêm mã 415, vì SPEC không có mã đó.
6. **Trang được dựng khi nào.**
   - Trang của `GET /` và `HEAD /` vẫn dựng một lần khi tạo server, bằng `renderCart(items)` không kèm mã. `POST /` dựng trang ở mỗi request.
   - Handler không bọc `try/catch`. Lỗi duy nhất có thể ném là `RangeError` của `total()`, và lỗi đó đã xảy ra khi `cartServer()` dựng trang `GET`, trước mọi request.
   - `discount()` không ném lỗi với mọi tạm tính mà `total()` trả về.
7. **Test của server.**
   - Mỗi `fetch` có `signal: AbortSignal.timeout(5000)`, và mỗi request `node:http` có `signal` tương tự.
   - Helper `start()` dừng server bằng `server.closeAllConnections()` rồi `server.close()`.
   - Kết quả chạy trên Node 24.17.0, với một listener ném lỗi:
     - Teardown hiện tại (chỉ `server.close()`) cùng `fetch` không timeout: `node --test` treo, và tôi ngắt nó sau 25 giây.
     - Thêm timeout cho `fetch`, hoặc thêm `closeAllConnections()`: test fail trong vòng 2 giây và tiến trình kết thúc.
     - `node:http` với `signal: AbortSignal.timeout(1000)`: `AbortError` sau khoảng 1 giây khi server không trả lời.
   - Test của `Host` dùng `node:http` hoặc `node:net`, không dùng `fetch`, vì `fetch` bỏ header `Host` tự đặt (xem ADR-0001).
     - Với `node:http`: `setHost: false`, hoặc `headers` dạng mảng như `['Host', a, 'Host', b]`.
     - Với `node:net`: gửi nguyên văn từng byte.
   - Một `fetch` gửi `POST /` phải tự đặt `Origin`, vì `fetch` của Node không gửi header này.
8. **Cơ sở dữ liệu và dependency.**
   - Cơ sở dữ liệu không đổi: Epic không có cơ sở dữ liệu, và danh sách mã là hằng số trong `src/coupon.ts`.
   - Không thêm dependency, theo mục Tech Stack của SPEC.
9. **Tài liệu của Epic ở lại trên nhánh `feature/DEMO-11-spec`.** Đây là câu trả lời Q1, ngày 2026-10-31.
   - SPEC, design, plan và ADR-0001 không merge vào `develop`, và không có PR tài liệu. Lý do: ở giai đoạn thử này của kit, luồng PR cho tài liệu chưa có; nó sẽ có ở một module sau.
   - Nhánh Story tách từ `develop` nên không có các file này. `be-dev`, `fe-dev`, `reviewer` và `qa` đọc tài liệu bằng `git show feature/DEMO-11-spec:docs/specs/DEMO-11/<file>`, và đọc ADR-0001 bằng `git show feature/DEMO-11-spec:docs/adr/0001-host-and-origin-checks-for-post.md`.
   - Story vẫn sang ready khi plan được duyệt.

## API Contract

Hợp đồng giữa Sub-task BE và Sub-task FE gồm ba phần:

1. `POST /`: Sub-task BE làm server; Sub-task FE làm form gửi tới nó.
2. Module `src/coupon.ts`.
3. Tham số `coupon` của `renderCart`.

Repo không có package type dùng chung, nên Sub-task BE export các kiểu từ `src/coupon.ts`. Khi một bên đổi kiểu, `npm run typecheck` báo lỗi ở bên kia.

### `POST /`

Request:

- Method `POST`, path `/`. Path được đọc như hôm nay: request target tới trước dấu `?`, giữ nguyên chuỗi. Query string bị bỏ qua.
- Header:
  - `Host`: đúng một header, bằng `127.0.0.1:<port>` hoặc `localhost:<port>`.
  - `Origin`: bằng `http://<Host>`.
  - `Content-Length`: không bắt buộc. Lớn hơn 1.024 thì server trả 413.
  - `Content-Type`: không kiểm (quyết định 5). Form của trang gửi `application/x-www-form-urlencoded`, là mặc định của `<form>`.
- Body: tối đa 1.024 byte, đọc bằng `URLSearchParams` (UTF-8).

| Trường | Phần tử của S1 | Ý nghĩa | Khi thiếu |
|---|---|---|---|
| `code` | Ô [3] (S1.3): `<input type="text" name="code">` | Mã người mua gõ, nguyên văn | Coi như chuỗi rỗng |
| `applied` | `<input type="hidden" name="applied">`, chỉ có khi đang áp mã | Mã đang áp, dạng chữ hoa | Coi như chưa áp mã |

- Một trường xuất hiện nhiều lần thì server lấy giá trị đầu (`URLSearchParams.get`). Trường khác bị bỏ qua.
- Server không đọc số tiền, phần trăm hay tổng cộng nào từ form.
- `applied` không có trong danh sách mã, ví dụ vì bị sửa tay, thì coi như chưa áp mã, không có thông báo riêng.

Response 200:

- Header giống `GET /`: `Content-Type: text/html; charset=utf-8`, cùng `Content-Security-Policy` và `X-Content-Type-Options: nosniff`.
- Không chuyển hướng, không `Set-Cookie`, không `Referrer-Policy`.
- Body: `renderCart(items, applyCoupon(form))`.

Kết quả theo `code` (sau khi bỏ khoảng trắng ở hai đầu và đổi sang chữ hoa) và `applied`:

| `code` | Mã được áp | [5] | Ô [3] chứa | AC |
|---|---|---|---|---|
| Có trong danh sách | Mã của `code`, thay mã cũ | Không có | Rỗng | AC1, AC2, AC3, AC4 |
| Rỗng | Mã `applied`, nếu `applied` có trong danh sách | "Vui lòng nhập mã giảm giá." | Chuỗi đã gõ, nguyên văn | AC6 |
| Không có trong danh sách | Mã `applied`, nếu `applied` có trong danh sách | "Mã giảm giá không hợp lệ." | Chuỗi đã gõ, nguyên văn | AC5, AC7, AC8 |

Mã dài hơn 64 ký tự (`maxlength` của ô) là mã không có trong danh sách. Body mã hóa sai, như `code=%FF`, cũng vậy: `URLSearchParams` đổi byte sai thành U+FFFD (SPEC, mục Security).

### Thứ tự kiểm và câu trả lời lỗi

Thứ tự này áp dụng cho mọi method và mọi path.

- Câu trả lời lỗi là `text/plain; charset=utf-8`, có `X-Content-Type-Options: nosniff`, và có body cố định như bảng.
- Body của 400, 403 và 413 lấy từ mục Screens của design.md.

| Bước | Điều kiện | Status | Body | Header thêm | AC |
|---|---|---|---|---|---|
| 1 | Không có đúng một `Host`, hoặc `Host` khác `127.0.0.1:<port>` và `localhost:<port>` | 400 | `Bad request` | | AC11 |
| 2 | Path khác `/` | 404 | `Not found` | | |
| 3 | `GET` hoặc `HEAD` | 200 | Trang dựng sẵn | Như hôm nay | |
| 4 | Method khác `GET`, `HEAD`, `POST` | 405 | `Method not allowed` | `Allow: GET, HEAD, POST` | |
| 5 | `POST`, `Origin` khác `http://<Host>` | 403 | `Forbidden` | | AC9 |
| 6 | `POST`, `Content-Length` lớn hơn 1.024 | 413 | `Payload too large` | `Connection: close` | AC10 |
| 7 | `POST`, body vượt 1.024 byte trong lúc đọc | 413 | `Payload too large` | `Connection: close` | AC10 |
| 8 | `POST`, body đọc xong | 200 | Trang theo mã | Như `GET /` | AC1–AC8 |

Client ngắt kết nối giữa body thì request đó kết thúc mà không có câu trả lời, và server vẫn trả lời các request sau.

Phác thảo cho `src/server.ts`. Đây chưa phải code hoàn chỉnh; `be-dev` tự đặt tên các hàm nội bộ:

```ts
const BODY_LIMIT = 1024; // bytes of a POST / body

// The Host of the request when it names this server, otherwise undefined: exactly one Host header, compared as is.
function ownHost(request: IncomingMessage, port: number): string | undefined {
  const count = request.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'host').length;
  const host = request.headers.host;
  return count === 1 && (host === `127.0.0.1:${port}` || host === `localhost:${port}`) ? host : undefined;
}

export function cartServer(items: CartItem[] = SAMPLE_CART): Server {
  const page = renderCart(items);
  const server = createServer({ requireHostHeader: false }, (request, response) => {
    const host = ownHost(request, (server.address() as AddressInfo).port);
    const path = (request.url ?? '/').split('?', 1)[0];
    if (host === undefined) {
      response.writeHead(400, TEXT_HEADERS).end('Bad request');
    } else if (path !== '/') {
      response.writeHead(404, TEXT_HEADERS).end('Not found');
    } else if (request.method === 'GET' || request.method === 'HEAD') {
      response.writeHead(200, PAGE_HEADERS).end(request.method === 'HEAD' ? undefined : page);
    } else if (request.method !== 'POST') {
      response.writeHead(405, { ...TEXT_HEADERS, Allow: 'GET, HEAD, POST' }).end('Method not allowed');
    } else if (request.headers.origin !== `http://${host}`) {
      response.writeHead(403, TEXT_HEADERS).end('Forbidden');
    } else {
      readBody(
        request,
        (body) => {
          const form = new URLSearchParams(body);
          const coupon = applyCoupon({ code: form.get('code') ?? '', applied: form.get('applied') ?? '' });
          response.writeHead(200, PAGE_HEADERS).end(renderCart(items, coupon));
        },
        () => response.writeHead(413, { ...TEXT_HEADERS, Connection: 'close' }).end('Payload too large'),
      );
    }
  });
  return server;
}

// Calls done with the body, or tooLarge once the body passes BODY_LIMIT bytes, keeping no more than that. Reads with
// data and end events, not for await, so a client that drops the connection mid-body ends only its own request.
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
```

### Module `src/coupon.ts`

Sub-task BE tạo module này; `src/server.ts` và `src/page.ts` dùng nó.

```ts
// A coupon of the fixed list. value: a percent for 'percent' (10 is 10%), an amount in đồng for 'amount'.
export interface Coupon {
  code: string; // upper case, as shown in line [7]
  kind: 'percent' | 'amount';
  value: number;
}

// GIAM10: 10% of the subtotal; GIAM20K: 20000 đồng. Changing this list is an "Ask first" of the SPEC.
export const COUPONS: readonly Coupon[];

// The coupon whose code equals the text once trimmed and upper-cased, or undefined. Never throws.
export function findCoupon(text: string): Coupon | undefined;

// The discount of a coupon on a subtotal, in đồng: a percent is rounded down, and the discount is never more than the
// subtotal. Throws a RangeError when the subtotal is not a finite number that is not negative, like total().
export function discount(coupon: Coupon, subtotal: number): number;

// The two fields of the coupon form as sent; a missing field is ''.
export interface CouponForm {
  code: string;
  applied: string;
}

// What the page shows about coupons.
export interface CouponState {
  applied: Coupon | null; // the coupon in force: line [7] and the hidden field `applied`
  rejected: { reason: 'empty' | 'invalid'; typed: string } | null; // message [5]; typed goes back into field [3] as is
}

// No coupon and no message: the page of GET / and HEAD /.
export const NO_COUPON: CouponState;

// The state after the form is sent, following the table of POST / above.
export function applyCoupon(form: CouponForm): CouponState;
```

Công thức của `discount`:

- Phần trăm: `Math.min(subtotal, Math.floor((subtotal * value) / 100))`.
- Số tiền: `Math.min(subtotal, value)`.

Ví dụ:

- `GIAM10` trên 39.000 giảm 3.900; trên 12.345 giảm 1.234.
- `GIAM20K` trên 15.000 giảm 15.000.

### `renderCart` và markup của S1

```ts
export function renderCart(items: CartItem[], coupon: CouponState = NO_COUPON): string;
```

Phần của Sub-task BE:

- Tổng cộng [9] = tạm tính − `discount(coupon.applied, tạm tính)` + `shipping(items)`. Không có mã đang áp thì không trừ gì.
- Phí vận chuyển [8] tính trên tạm tính trước giảm; `src/cart.ts` không đổi.
- Giỏ trống không có [3] đến [9], và bỏ qua `coupon`.

Phần của Sub-task FE. Test và server dựa vào các tên dưới đây, nên giữ đúng:

| Khối | Markup | Khi nào |
|---|---|---|
| Form | `<form method="post" action="/">`, chứa [3], [4], trường ẩn và [5] | Giỏ không trống |
| [3] | `<label for="coupon-code">Mã giảm giá</label>` và `<input type="text" id="coupon-code" name="code" maxlength="64" value="…">` | Khi có lỗi, `value` là `escapeHtml(rejected.typed)`, và ô có thêm `autofocus aria-invalid="true" aria-describedby="coupon-error"`. Khi không có lỗi, `value` rỗng và ô không có ba thuộc tính này. |
| [4] | `<button type="submit">Áp dụng</button>` | Luôn có, cùng form |
| Trường ẩn | `<input type="hidden" name="applied" value="…">` | Chỉ khi `applied` khác `null`. `value` là `escapeHtml(applied.code)` |
| [5] | Phần tử có `id="coupon-error"` và `data-testid="coupon-error"` | Chỉ khi `rejected` khác `null`. Câu chữ theo `reason` |
| [7] | `<dt>Giảm giá (…)</dt><dd data-testid="discount">…</dd>`, nằm giữa [6] và [8] | Chỉ khi `applied` khác `null`. Giá trị là `formatMoney(-số tiền giảm)`. Số tiền giảm bằng 0 thì giá trị là "0 ₫", không có dấu trừ (Q2), vì `formatMoney(-0)` cho "-0 ₫" |

- Thuộc tính luôn có dấu nháy kép. Mọi chuỗi từ người dùng hay từ danh sách mã đi qua `escapeHtml`.
- Không thêm `<script>`, không thêm `Referrer-Policy`, không đổi CSP.
- Câu chữ dùng đúng như SPEC và design: "Mã giảm giá", "Áp dụng", "Mã giảm giá không hợp lệ.", "Vui lòng nhập mã giảm giá.", "Giảm giá (<mã>)".

## Task List

`ba` tạo Story và hai Sub-task trên Jira theo plan này, rồi thay `<STORY-KEY>`, `<BE-KEY>`, `<FE-KEY>` bằng key thật.

- Nhánh của Story là `feature/<STORY-KEY>-coupon-code`, tách từ `develop`. Nhánh `develop` đã có DEMO-10 (commit `6c25b8b`; tôi kiểm ngày 2026-10-31).
- Hai Sub-task commit lên nhánh này, BE trước.
- Story không phụ thuộc item Jira nào.
- Tài liệu của Epic không có trên `develop` hay trên nhánh Story. Mọi agent đọc chúng từ nhánh `feature/DEMO-11-spec` bằng `git show` (quyết định 9). Story sang ready khi plan được duyệt.

### Phase 1: Server
- [ ] `<STORY-KEY>`: Áp mã giảm giá trên trang giỏ hàng (Story: AC1–AC11, S1)
- [ ] `<BE-KEY>`: BE: tính giảm giá và bảo vệ `POST /` bằng `Host`, `Origin` và cỡ body

### Checkpoint: Server
- [ ] `npm run lint`, `npm run typecheck` và `npm test` xanh.
- [ ] `npm run test:e2e`: hai E2E của DEMO-10, cùng AC9, AC10, AC11, pass.
- [ ] Integration test: `code=GIAM10` cho tổng cộng 38.100 ₫, và `code=SAIMA&applied=GIAM10` cũng cho 38.100 ₫.
- [ ] Kiểm tay, không commit: với một listener ném lỗi, `npm test` báo fail và kết thúc.

### Phase 2: Trang
- [ ] `<FE-KEY>`: FE: form mã giảm giá, dòng giảm giá và thông báo lỗi trên S1

### Checkpoint: Story
- [ ] E2E của AC1–AC11 (DEMO-11) và của AC1, AC2 (DEMO-10) pass trên Chrome.
- [ ] `npm run test:coverage`: ít nhất 80% số dòng thay đổi được phủ.
- [ ] Kiểm tay S1 ở 320, 768, 1024 và 1440 px.
- [ ] Mở PR của Story.

### Sub-task BE (`be-dev`)

- AC:
  - Toàn bộ AC9, AC10, AC11, kể cả E2E.
  - Phần server của AC1–AC8: tính số tiền giảm, giữ mã đang áp, tính tổng cộng.
- Design: S1.9 (tổng cộng). Sub-task này không đổi markup nào khác.
- File code (4):
  - `src/coupon.ts` (mới);
  - `src/server.ts`;
  - `src/page.ts`: chỉ chữ ký `renderCart` và công thức tổng cộng;
  - `package-lock.json`: sửa bằng `npm install --package-lock-only`.
- Tài liệu: `README.md`, thêm `POST /` và danh sách mã.
- File test: `src/coupon.test.ts` (mới), `src/server.test.ts`, `src/page.test.ts`, `e2e/coupon.spec.ts` (mới).
- Các bước, mỗi bước test đỏ trước:
  1. `src/server.test.ts`: mọi request có timeout 5.000 ms; teardown gọi `closeAllConnections()` rồi `close()`.
  2. `package-lock.json`: `engines.node` là `">=24.2"`.
  3. `src/coupon.ts`:
     - unit test theo SPEC: chuẩn hóa, mã sai, mã rỗng, 10% của 12.345 là 1.234, `GIAM20K` trên 15.000 giảm 15.000;
     - `applyCoupon` theo bảng kết quả của `POST /`.
  4. `Host` (AC11):
     - tạo server với `requireHostHeader: false`; trả 400 trước 404;
     - test: `Host` lạ; thiếu `Host` với HTTP/1.0 và với HTTP/1.1; hai `Host`; `localhost:<port>` nhận 200.
  5. Method và `Origin` (AC9):
     - 405 với `Allow: GET, HEAD, POST`; test "another method" đổi sang `PUT`;
     - `Origin` khác, thiếu, `null`, hoặc hai header `Origin`: 403.
  6. Body (AC10):
     - có và không có `Content-Length`: 413 với `Connection: close`, và `GET /` sau đó nhận 200;
     - body đúng 1.024 byte: 200;
     - client ngắt giữa body: `GET /` sau đó nhận 200.
  7. `POST /` hợp lệ:
     - tổng cộng 38.100 ₫ với `GIAM10`;
     - 22.000 ₫ với `GIAM20K`, kể cả khi kèm `applied=GIAM10`;
     - 42.000 ₫ với `SAIMA`, với mã rỗng, với `code=%FF`, và với `applied` bị sửa thành mã lạ;
     - 38.100 ₫ với `code=SAIMA&applied=GIAM10`;
     - header của câu trả lời 200 giống `GET /`, và không có `Referrer-Policy: no-referrer`;
     - `src/page.test.ts`: giỏ có tạm tính 55.000 ₫ áp `GIAM10` vẫn miễn phí vận chuyển, tổng cộng 49.500 ₫.
  8. `e2e/coupon.spec.ts`: tạo `test.describe('DEMO-11', …)` với AC9, AC10, AC11. Các test gửi request thô bằng `node:http` hoặc `node:net` tới `baseURL`. Sau đó cập nhật README.

### Sub-task FE (`fe-dev`)

- AC: AC1–AC8, phần trang và E2E.
- Design:
  - S1.3, S1.4, S1.5, S1.7;
  - S1.6, S1.8, S1.9 giữ `data-testid` hiện có;
  - bố cục theo cỡ màn hình của S1.
- File code (1): `src/page.ts`. Gồm form, trường ẩn, [5], [7], CSS `flex-wrap` của hàng [3] [4], màu chữ lỗi, và viền ô khi có lỗi.
- File test:
  - `src/page.test.ts`: form và nút; dòng giảm giá; hai thông báo; escape mã trong thông báo và trong `value`; giỏ trống không có form; giỏ 55.000 ₫ có thêm dòng "-5.500 ₫"; giỏ có tạm tính 5 ₫ áp `GIAM10` có dòng giảm giá "0 ₫", không có dấu trừ (Q2);
  - `src/server.test.ts`: `POST /` trả dòng giảm giá và thông báo đúng;
  - `e2e/coupon.spec.ts`: AC1–AC8 trong `describe` DEMO-11. Tìm ô bằng nhãn "Mã giảm giá", nút bằng role, và đọc kết quả theo `data-testid`.
- Kiểm tay:
  - `autofocus` dưới CSP trên Chrome. Không chạy thì bỏ, giữ `aria-invalid` và `aria-describedby`.
  - Bố cục ở 320, 768, 1024 và 1440 px. Bảng [2] tràn ngang ở 320 px thì báo `ba` tạo Task riêng; Story không sửa bảng.
- Phụ thuộc: Sub-task BE đã commit lên nhánh của Story.

### Verification của Story

```
npm run lint && npm run typecheck && npm test
npm run test:coverage   # at least 80% of changed lines covered
npm run test:e2e        # AC1–AC11 of DEMO-11, AC1 and AC2 of DEMO-10
```

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Chrome gửi `Origin: null` khi trang đặt `Referrer-Policy: no-referrer`, và form của chính trang nhận 403 | High | Mục Never của SPEC cấm đặt chính sách này. Integration test kiểm trang không có header đó. E2E AC1 gửi form thật trên Chrome. |
| Test `Host` viết bằng `fetch` pass sai: `fetch` bỏ header `Host` tự đặt, và tôi đã thấy `Host: evil.example` vẫn nhận 200 | High | Test `Host` chỉ dùng `node:http` hoặc `node:net` (quyết định 7). Reviewer kiểm điểm này. |
| Bước kiểm `Host` chặn request kiểm sẵn sàng của `webServer` trong Playwright (`url: http://127.0.0.1:3100/`), và E2E không chạy | Medium | [Inference] Client HTTP lấy `Host` từ URL, tức `127.0.0.1:3100`, nên request này qua được. Checkpoint Server chạy `npm run test:e2e` ngay sau Sub-task BE để kiểm. |
| E2E chưa chạy trong CI | Medium | Mỗi checkpoint chạy `npm run test:e2e` trên máy. `qa` chạy lại khi verify. |
| Sub-task BE và Sub-task FE cùng sửa `src/page.ts` trên một nhánh | Low | BE chỉ đổi chữ ký `renderCart` và công thức tổng cộng. FE bắt đầu sau khi BE đã commit. |
| Sau 400, 403, 404 hay 405 cho một request có body, Node đọc rồi bỏ body để giữ kết nối | Low | [Inference] Tôi suy ra từ lần chạy 413 không có `Connection: close`, khi Node đọc rồi bỏ 5 MB. Node không giữ phần body đó trong bộ nhớ, và server chỉ nghe `127.0.0.1`. Chấp nhận: theo SPEC, chỉ 413 đóng kết nối. |
| `autofocus` không chạy dưới CSP của trang | Low | `fe-dev` kiểm trên Chrome. Không chạy thì bỏ, giữ ARIA (design, S1.3). |
| Bảng [2] tràn ngang ở 320 px | Low | Theo design S1.2, `ba` tạo Task riêng; Story không sửa bảng. |
| Một agent tìm tài liệu trên nhánh Story hay trên `develop` và không thấy, vì tài liệu chỉ có trên `feature/DEMO-11-spec` | Low | Quyết định 9 ghi lệnh `git show` để đọc tài liệu. `ba` chép lệnh này vào mô tả của Story. |

## Open Questions

Không còn câu hỏi mở.

- Q1 và Q2 được trả lời ngày 2026-10-31, thay người duyệt.
- Q1 thành quyết định 9 của mục Architecture Decisions và đoạn đầu của mục Task List: tài liệu ở lại trên `feature/DEMO-11-spec`, không có PR tài liệu, và các agent đọc tài liệu bằng `git show`.
- Q2 thành dòng [7] của bảng markup S1 và một test của Sub-task FE: số tiền giảm bằng 0 hiện "0 ₫", không có dấu trừ.
