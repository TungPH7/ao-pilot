# Implementation Plan: Xóa sản phẩm khỏi giỏ hàng

> **Epic:** DEMO-20 · **Jira:** https://phunghuutung12b4.atlassian.net/browse/DEMO-20 · **Spec:** [spec.md](spec.md) · **Tasks:** tracked in Jira under DEMO-20

## Overview

Epic giao một Story Jira, gồm AC1–AC11 và màn hình S1 của [design.md](design.md). Story chia hai Sub-task, cùng commit lên nhánh của Story: Sub-task BE làm trước, rồi tới Sub-task FE.

- Sub-task BE làm phần dữ liệu và server:
  - mã dòng `CartItem.id`, mã của `SAMPLE_CART`, và bước kiểm mã khi tạo server;
  - hàm thuần chọn các dòng còn lại (`src/cart.ts`) và giữ mã đang áp khi xóa (`src/coupon.ts`);
  - `POST /` đọc `remove` và `removed`, và tính mọi con số trên giỏ còn lại;
  - README.

  Khi BE xong, `POST /` với `remove` và `removed` đã cho đúng bảng và con số của AC1–AC9, và AC10, AC11 đã pass, dù trang chưa có nút "Xóa".
- Sub-task FE làm phần trang: nút "Xóa" [3] trong form riêng, các trường ẩn trong mọi form, cột thứ năm, khung cuộn ngang, luật dưới 30 rem. FE cũng đổi bốn unit test và AC1 của DEMO-10 theo mục Tests that change của SPEC, và viết E2E của AC1–AC9.

PR của Story chỉ mở khi cả hai Sub-task đã xong.

Tôi đã chạy thử hợp đồng của plan này ngày 2026-11-01, trên Node 24.17.0, với một prototype ở `.ai/sa/demo-20/plan-probe/` (không commit):

- Trạng thái sau Sub-task BE: `npm run typecheck` và ESLint sạch. 95 test hiện có pass, chỉ đổi dữ liệu (thêm `id` vào 7 dòng của `src/page.test.ts` và 1 dòng của `src/server.test.ts`).
- Gửi các body của bảng kết quả ở mục API Contract tới server thật: mọi con số của AC1–AC11 khớp SPEC. Body 612 byte của form mã được đọc và nhận 200.
- Trạng thái sau Sub-task FE: đúng bốn unit test fail, cũng là bốn test mà SPEC liệt kê ở mục Tests that change. 91 test còn lại pass mà không đổi.

## Architecture Decisions

1. **Một Story, hai Sub-task, không có Task.**
   - Cả Epic đụng bốn file code. Ba user story dùng chung các file đó và chung một giao thức form.
   - Tách thành nhiều Story sẽ tạo ba PR nối tiếp nhau trên cùng các file. Nó cũng tạo một bản trung gian dở: xóa một dòng làm mất mã đang áp (user story 2), hay Enter trong ô mã xóa một dòng (AC9).
   - `work-items.yaml` chỉ tách Task cho phần nền dùng chung cho nhiều Story. Epic chỉ có một Story, nên không có Task.
   - Story có cả FE và BE, nên chia Sub-task BE rồi Sub-task FE (`work-items.yaml`).
2. **Giỏ còn lại đi theo form bằng mã dòng cố định; server không lưu trạng thái.** Chi tiết và các phương án đã bỏ ở [ADR-0002](../../adr/0002-remaining-cart-travels-in-the-form-by-line-id.md).
   - Tên trường chốt theo đề xuất của SPEC: nút "Xóa" gửi `remove=<mã dòng>`, và mọi form mang `removed=<mã dòng>`, lặp lại một lần cho mỗi dòng đã xóa. `applied` giữ như DEMO-11.
   - SPEC đã dùng đúng các tên này để tính giới hạn body (44 và 612 byte), nên SPEC không phải sửa.
3. **Mã dòng: 1 đến 32 ký tự `a`–`z`, `0`–`9`, `-`; không trùng; kiểm khi tạo server.**
   - `cartServer(items)` gọi `checkLineIds(items)` trước `renderCart(items)`. Giỏ vi phạm làm hàm này ném `RangeError` khi tạo server, không ở một request, như giá sai hôm nay.
   - Lý do của bộ ký tự: mã không phải mã hóa trong body, nên mỗi dòng đã xóa đúng bằng 9 byte cộng độ dài mã, như mục Performance của SPEC tính. Mã cũng không có ký tự nào cần escape, dù vẫn đi qua `escapeHtml`.
   - Kiểm `typeof id === 'string'` trước biểu thức chính quy. `/^[a-z0-9-]{1,32}$/.test(undefined)` kiểm chuỗi `"undefined"` và trả `true`, nên một giỏ viết bằng JavaScript thiếu `id` sẽ lọt qua. `npm test` chạy bằng type stripping, không kiểm kiểu.
   - Mã của giỏ: `SAMPLE_CART` có `but-bi` và `so-tay` (Q5 của SPEC). Giỏ của AC4 có `ban-phim` và `chuot`.
4. **Bốn file code, mỗi file một việc, như DEMO-11.**
   - `src/cart.ts` thêm hai hàm thuần, `checkLineIds` và `removeLines`. Hai hàm này không biết HTTP hay HTML.
     - Hai hàm nằm ở đây, không ở module mới: chúng làm việc trên các dòng của giỏ như `total()`, và lỗi mã sai cùng loại với lỗi giá sai của `total()`.
     - Hai hàm nhận kiểu chung `{ id: string }`, nên `Line` không đổi.
   - `src/coupon.ts` thêm `keepCoupon(applied)`: quy tắc chọn mã đang áp cho một form không gửi mã. Quy tắc mã nằm ở `coupon.ts` theo quyết định 2 của plan DEMO-11.
   - `src/server.ts` đọc form, gọi `removeLines`, chọn `applyCoupon` hay `keepCoupon`, rồi dựng trang.
   - `src/page.ts` chỉ dựng HTML.
     - `renderCart` nhận các dòng còn lại, đã chọn sẵn. Tham số mới `removed` chỉ dùng để ghi các trường ẩn.
     - `CartItem` ở lại `src/page.ts`: chuyển nó đi sẽ đổi import của các test hiện có, là một mục Ask first.
5. **Một request là yêu cầu xóa khi body có trường `remove`, kể cả khi trường đó rỗng.**
   - Với yêu cầu xóa, server không đọc `code`: trang không có thông báo lỗi mã, và mã trong `applied` được kiểm lại theo danh sách mã (`keepCoupon`).
   - Không có `remove` thì server áp mã như DEMO-11 (`applyCoupon`), trên giỏ còn lại.
   - Trang không bao giờ gửi `remove` rỗng. Quy tắc "có trường là yêu cầu xóa" là quy tắc đơn giản nhất, và `remove=&code=SAIMA` không hiện thông báo nào.
6. **Sub-task FE thêm tham số `removed` của `renderCart`, cùng một dòng nối ở `src/server.ts`.**
   - ESLint của repo (`@typescript-eslint/no-unused-vars`) báo lỗi với tham số cuối không dùng. Tôi chạy thử ngày 2026-11-01, và một tham số như vậy nhận `error`. Vì vậy Sub-task BE không thêm được tham số này trước khi có markup dùng nó.
   - Sub-task BE chỉ lấy `kept` từ `removeLines` và gọi `renderCart(kept, coupon)`. Sub-task FE lấy thêm `removed` và gọi `renderCart(kept, coupon, removed)`.
   - Nhờ vậy mỗi commit của hai Sub-task đều qua pre-commit, typecheck và test.
7. **Markup và CSS của S1 được chốt trong plan**, ở mục API Contract. Design để `fe-dev` chọn, nhưng test và E2E dựa vào các tên này.
   - Form của nút "Xóa" nhận luật ghi đè `td form{display:block;margin:0}`, không đổi luật `form{…}` của form mã. Cách này giữ đúng regex `form\{[^}]*display:flex` của test style hiện có.
   - STYLE có đúng một media query, `@media (max-width:30rem)`, theo design.
8. **Test.**
   - `e2e/remove.spec.ts` (mới) đặt mọi test trong `test.describe('DEMO-20', …)`.
     - Sub-task BE viết AC10 và AC11 bằng request thô `node:http`.
     - Sub-task FE viết AC1–AC9 qua trang.
   - Helper `raw` được chép từ `e2e/coupon.spec.ts`, không tách ra module chung: tách ra thì phải sửa `e2e/coupon.spec.ts`, một test hiện có (Ask first).
   - AC4 tự khởi động `cartServer(items)` trên port 0 của `127.0.0.1`, và đóng server trong `finally` bằng `closeAllConnections()` rồi `close()`. `ba` đã chạy thử cách này trong `.ai/ba/demo-20/probe/`.
   - Helper `start(t)` của `src/server.test.ts` thêm tham số tùy chọn `items`, để test ngưỡng miễn phí vận chuyển dùng giỏ 55.000 ₫. Mọi test hiện có vẫn gọi `start(t)` như cũ.
9. **Cơ sở dữ liệu và dữ liệu.**
   - Cơ sở dữ liệu: không có, không đổi.
   - Mô hình dữ liệu đổi một chỗ: `CartItem` có `id: string` bắt buộc. `SAMPLE_CART` thêm `id`, không đổi dòng, giá hay số lượng.
   - Không thêm dependency, theo mục Tech Stack của SPEC.
10. **Tài liệu của Epic.**
    - Plan và ADR-0002 vào PR tài liệu #15, cùng SPEC và design. `merge-gate` merge PR đó vào `develop` sau gate ②.
    - Nhánh Story tách từ `develop` sau khi PR #15 merge thì có đủ tài liệu. Nếu PR chưa merge, agent đọc bằng `MSYS_NO_PATHCONV=1 git show origin/feature/DEMO-20-spec:docs/specs/DEMO-20/<file>`.
    - ADR-0001 chỉ có trên `feature/DEMO-11-spec` (quyết định 9 của plan DEMO-11).
11. **Effort: DEMO-22 (Sub-task BE) chạy ở `xhigh`; DEMO-23 (Sub-task FE) giữ effort mặc định của vai trò.** Quyết định của bạn trước gate ②, ngày 2026-11-01.
    - Lý do nâng DEMO-22: đây là phần server đọc dữ liệu từ form (`remove`, `removed`), tức ranh giới tin cậy mới của Epic. AC11 và các test của mục Non-functional requirements ghim ranh giới này.
    - Trên Jira, DEMO-22 mang nhãn `ao-effort-xhigh` cùng nhãn `ao-be-dev`. DEMO-23 không có nhãn effort.
    - Không item nào ở `max`. Đề xuất ban đầu của plan là effort mặc định cho cả hai Sub-task: không có tiền thật đi qua (không thanh toán, giỏ mẫu cố định), không có dữ liệu được lưu, và các bước kiểm `Host`, `Origin` và cỡ body không đổi, đã có test phủ.

## API Contract

Hợp đồng giữa Sub-task BE và Sub-task FE gồm bốn phần:

1. `POST /`: Sub-task BE làm server; Sub-task FE làm các form gửi tới nó.
2. Module `src/cart.ts` và `src/coupon.ts`: Sub-task BE.
3. `CartItem` và `cartServer`: Sub-task BE.
4. Tham số `removed` của `renderCart` và markup của S1: Sub-task FE.

Repo không có package type dùng chung, nên các kiểu được export từ `src/cart.ts`, `src/coupon.ts` và `src/page.ts`. Khi một bên đổi kiểu, `npm run typecheck` báo lỗi ở bên kia.

### `POST /`

Thứ tự kiểm, header, giới hạn body và câu trả lời lỗi giữ nguyên như README và plan DEMO-11. Yêu cầu xóa đi qua bước kiểm `Origin` trước khi body được đọc. Vì vậy một yêu cầu xóa có `Origin` sai nhận 403, kể cả khi body quá 1.024 byte (AC10).

Body được đọc bằng `URLSearchParams` (UTF-8), như hôm nay:

| Trường | Phần tử của S1 | Đọc bằng | Ý nghĩa | Khi thiếu |
|---|---|---|---|---|
| `remove` | Nút [3] (S1.3): `<button type="submit" name="remove" value="<mã dòng>">` | `form.get` (giá trị đầu) | Mã dòng cần xóa lần này. Có trường này, kể cả rỗng, là yêu cầu xóa (quyết định 5) | Không phải yêu cầu xóa |
| `removed` | `<input type="hidden" name="removed">`, một cho mỗi dòng đã xóa, trong mọi form | `form.getAll` (mọi giá trị) | Mã các dòng đã xóa trước đó | Không dòng nào đã xóa |
| `code` | Ô [4] (S1.4) | `form.get` | Như DEMO-11. Không đọc khi có `remove` | `''` |
| `applied` | `<input type="hidden" name="applied">`, nay trong mọi form | `form.get` | Như DEMO-11 | `''` |

- Server không đọc trường nào khác: tên, đơn giá, số lượng, tạm tính hay tổng cộng gửi lên đều bị bỏ qua (AC11).
- Mã dòng gửi lên được so nguyên chuỗi với mã của giỏ server. Không trim, không đổi hoa thường. Mã lạ, trùng hay rỗng bị bỏ qua, không có thông báo, và không bao giờ ném lỗi.

Xử lý, theo thứ tự:

1. Các dòng còn lại: `removeLines(items, [...removed, remove])`, trong đó `remove` chỉ có mặt khi request là yêu cầu xóa.
2. Mã: có `remove` thì `keepCoupon(applied)`, không có thì `applyCoupon({ code, applied })`.
3. Câu trả lời 200 có header như `GET /`. Body là `renderCart(kept, coupon, removed)`, với `removed` là mã các dòng đã xóa, lấy từ giỏ server.

Kết quả trên giỏ mẫu. Tôi đã kiểm từng dòng trên prototype ngày 2026-11-01:

| Body | Bảng | Giảm giá | Tổng cộng | Thông báo [6] | AC |
|---|---|---|---|---|---|
| `remove=but-bi` | Sổ tay | Không có | 27.000 ₫ | Không có | AC1 |
| `remove=so-tay` | Bút bi | Không có | 18.000 ₫ | Không có | AC2 |
| `removed=but-bi&remove=so-tay` | "Giỏ hàng trống." | Không có | Không có | Không có | AC3 |
| `applied=GIAM10&remove=but-bi` | Sổ tay | -2.400 ₫ | 24.600 ₫ | Không có | AC5 |
| `applied=GIAM20K&remove=so-tay` | Bút bi | -15.000 ₫ | 3.000 ₫ | Không có | AC6 |
| `code=GIAM10&removed=but-bi` | Sổ tay | -2.400 ₫ | 24.600 ₫ | Không có | AC7 |
| `code=SAIMA&removed=but-bi` | Sổ tay | Không có | 27.000 ₫ | "Mã giảm giá không hợp lệ." | AC8 |
| `code=GIAM10` | Hai dòng | -3.900 ₫ | 38.100 ₫ | Không có | AC9 |
| `remove=khong-co&name=X&price=1&quantity=99&total=1` | Hai dòng, như cũ | Không có | 42.000 ₫ | Không có | AC11 |
| `remove=but-bi&code=SAIMA` hoặc `remove=but-bi&code=GIAM10` | Sổ tay | Không có: không đọc `code` | 27.000 ₫ | Không có | |
| `remove=` hoặc `remove=khong-co&remove=but-bi` | Hai dòng: mã rỗng, và chỉ đọc giá trị đầu | Không có | 42.000 ₫ | Không có | |
| `remove=constructor`, `remove=__proto__`, `removed=toString&removed=hasOwnProperty`, `remove=BUT-BI` | Hai dòng | Không có | 42.000 ₫ | Không có | |
| `removed=but-bi&removed=but-bi&removed=&remove=so-tay` | "Giỏ hàng trống." | Không có | Không có | Không có | |

- AC4: giỏ `[{ id: 'ban-phim', name: 'Bàn phím', price: 40000, quantity: 1 }, { id: 'chuot', name: 'Chuột', price: 15000, quantity: 1 }]`. Body `remove=chuot` cho bảng còn Bàn phím, tạm tính 40.000 ₫, phí vận chuyển 3.000 ₫, tổng cộng 43.000 ₫.
- AC10: `remove=but-bi` với `Origin: http://evil.example`, hoặc không có `Origin`, nhận 403 `Forbidden`, `text/plain`.
- Gửi lại cùng một body cho đúng cùng một trang.
- Body 612 byte `code=<64 lần %E1%BA%A1>&removed=but-bi&applied=GIAM20K` nhận 200.

Phác thảo cho handler của `POST /` trong `src/server.ts`, ở trạng thái sau Sub-task FE. Đây chưa phải code hoàn chỉnh:

```ts
(body) => {
  // Any Content-Type is read as a form; bytes that are not UTF-8 become U+FFFD, an unknown code or line id.
  const form = new URLSearchParams(body);
  const remove = form.get('remove'); // a remove request whenever the field is there, even empty
  const sent = form.getAll('removed');
  const { kept, removed } = removeLines(items, remove === null ? sent : [...sent, remove]);
  const applied = form.get('applied') ?? '';
  // A remove request reads no code, so it never shows a message about one.
  const coupon = remove === null ? applyCoupon({ code: form.get('code') ?? '', applied }) : keepCoupon(applied);
  response.writeHead(200, PAGE_HEADERS).end(renderCart(kept, coupon, removed));
},
```

Sau Sub-task BE, dòng gọi hàm là `const { kept } = removeLines(…)`, và câu trả lời là `renderCart(kept, coupon)` (quyết định 6).

### Module `src/cart.ts` và `src/coupon.ts`

Sub-task BE thêm vào `src/cart.ts`:

```ts
// The id of a line: 1 to 32 of a–z, 0–9 and -, so a form sends it as it is, with no percent-encoding.
const LINE_ID = /^[a-z0-9-]{1,32}$/;

// Throws a RangeError when a line has an id that is not LINE_ID, or the id of an earlier line. typeof comes first:
// LINE_ID.test(undefined) tests the string "undefined", which passes.
export function checkLineIds(lines: readonly { id: string }[]): void;

// The lines that stay once the lines whose id is one of ids are taken out, in the order of the cart, and the ids of the
// lines taken out, in the same order, each once and taken from the lines, never from ids. An id that is no line of the
// cart, a repeated one or an empty one is ignored; ids are compared as they are. Lookups go through a Set, never the
// keys of an object, so "constructor" or "__proto__" is an unknown id. Never throws, and changes nothing it is given.
export function removeLines<T extends { id: string }>(lines: readonly T[], ids: Iterable<string>): { kept: T[]; removed: string[] };
```

Sub-task BE thêm vào `src/coupon.ts`:

```ts
// The state after a form that sends no code, such as the form of a Xóa button: the coupon in force, checked against the
// list again like any code, and no message.
export function keepCoupon(applied: string): CouponState;
```

`keepCoupon` trả `{ applied: findCoupon(applied) ?? null, rejected: null }`. Mã đang áp được trim và đổi chữ hoa như `applyCoupon` hôm nay.

### `CartItem` và `cartServer`

Sub-task BE:

```ts
// src/page.ts
export interface CartItem extends Line {
  id: string; // fixed, never the position of the line: the Xóa button and the hidden fields removed carry it
  name: string;
}

// src/server.ts
export const SAMPLE_CART: CartItem[] = [
  { id: 'but-bi', name: 'Bút bi', price: 5000, quantity: 3 },
  { id: 'so-tay', name: 'Sổ tay', price: 12000, quantity: 2 },
];

export function cartServer(items: CartItem[] = SAMPLE_CART): Server {
  checkLineIds(items); // a RangeError here, when the server is made, never on a request
  const page = renderCart(items);
  // …
}
```

### `renderCart` và markup của S1

Sub-task FE:

```ts
// The cart page. items: the lines that stay, already taken from the server cart. removed: the ids of the lines removed
// before, from the server cart, which every form of the page sends back in hidden fields. An empty cart ignores both
// the coupon and removed.
export function renderCart(items: CartItem[], coupon: CouponState = NO_COUPON, removed: readonly string[] = []): string;
```

Test và E2E dựa vào các tên dưới đây, nên giữ đúng. Số khối theo design.md của DEMO-20.

| Khối | Markup | Khi nào |
|---|---|---|
| Khung của [2] | `<div class="scroll"><table>…</table></div>` | Giỏ không trống |
| Tiêu đề cột thứ năm | `<th scope="col"><span class="sr-only">Thao tác</span></th>`, sau bốn `th` hiện có | Giỏ không trống |
| Ô của [3] | Ô thứ năm của mỗi `<tr data-testid="cart-line">`: `<td><form method="post" action="/">` + trường ẩn + `<button type="submit" name="remove" value="…" aria-label="Xóa …">Xóa</button></form></td>` | Mỗi dòng. `value` là `escapeHtml(item.id)`; `aria-label` là `Xóa ` + `escapeHtml(item.name)` |
| Trường ẩn | `<input type="hidden" name="removed" value="…">` cho mỗi mã của `removed`, theo thứ tự đó, rồi `<input type="hidden" name="applied" value="…">` khi có mã đang áp | Trong mọi form. Ở form của [3], trường ẩn đứng trước nút. Ở form mã, chúng đứng sau [5] và trước [6], như `applied` hôm nay |
| Form mã | Như DEMO-11, thêm các trường ẩn `removed` | Giỏ không trống |

- Bốn ô đầu của mỗi dòng giữ đúng markup của DEMO-10.
- Giỏ đủ và không có mã thì trang không có trường ẩn nào, như test hiện có.
- Không nút "Xóa" nào nằm trong form mã, và không nút nào có thuộc tính `form` (SPEC, Never).
- Thuộc tính luôn có dấu nháy kép.
- Giỏ trống giữ đúng trang hiện có: không bảng, không form nào.
- Chú thích hiện có trong `src/page.ts` giữ số khối của DEMO-11, như design đã ghi. Chú thích mới gọi khối bằng tên ("the Xóa button"), để không lẫn hai cách đánh số.

CSS thêm vào `STYLE`, sau các luật hiện có:

```css
.scroll{overflow-x:auto;position:relative}
td form{display:block;margin:0}
.sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
@media (max-width:30rem){body{margin:1rem}th,td{padding:.25rem .5rem}}
```

- `position:relative` của `.scroll` giữ chữ ẩn "Thao tác" trong khung. Không có nó, trang cuộn ngang thêm 30 px ở 320 px (design, Bố cục).
- Không luật nào tắt `outline`.
- Câu chữ mới chỉ có "Xóa", "Xóa <tên sản phẩm>" và "Thao tác", như SPEC và design.

## Task List

`ba` đã tạo Story và hai Sub-task trên Jira theo plan này ngày 2026-11-01: DEMO-21, DEMO-22 và DEMO-23. Cả ba ở trạng thái đầu của workflow, chờ gate ②.

- Nhánh của Story là `feature/DEMO-21-remove-from-cart`, tách từ `develop`. Hai Sub-task commit lên nhánh này, BE trước.
- Story không phụ thuộc item Jira nào. `develop` đã có DEMO-10 và DEMO-12 (commit `6c25b8b` và `26c8ddb`; tôi kiểm ngày 2026-11-01).
- Story sang ready khi plan được duyệt.

### Phase 1: Server
- [ ] DEMO-21: Xóa sản phẩm khỏi giỏ hàng (AC1–AC11; S1, khối S1.2–S1.10) · be-dev, fe-dev (Sub-task)
- [ ] DEMO-22: BE: mã dòng và yêu cầu xóa của `POST /` (AC10, AC11, phần server của AC1–AC9; S1.7–S1.10) · be-dev · effort xhigh: phần server đọc dữ liệu từ form, ranh giới tin cậy mới (quyết định 11)

### Checkpoint: Server
- [ ] `npm run lint`, `npm run typecheck` và `npm test` xanh.
- [ ] Integration test của `src/server.test.ts` cho đúng bảng kết quả của `POST /` ở mục API Contract.
- [ ] `npm run test:e2e`: E2E của DEMO-10 và DEMO-11 vẫn pass, không đổi; AC10, AC11 của DEMO-20 pass.

### Phase 2: Trang
- [ ] DEMO-23: FE: nút Xóa, trường ẩn và bố cục của S1 (AC1–AC9; S1.2, S1.3, S1.4, S1.5, S1.6) · fe-dev

### Checkpoint: Story
- [ ] E2E của AC1–AC11 (DEMO-20), AC1–AC11 (DEMO-11) và AC1, AC2 (DEMO-10, AC1 đổi theo ô mới) pass trên Chrome.
- [ ] `npm run test:coverage`: ít nhất 80% số dòng thay đổi được phủ.
- [ ] Kiểm tay S1 ở 320, 360, 768, 1024 và 1440 px.
- [ ] Mở PR của Story.

### Sub-task BE DEMO-22 (`be-dev`, effort `xhigh`)

- AC:
  - Toàn bộ AC10 và AC11, kể cả E2E.
  - Phần server của AC1–AC9: bảng và con số của `POST /` với `remove` và `removed`, qua integration test.
- Design: S1.7–S1.10 tính trên giỏ còn lại. Sub-task này không đổi markup nào.
- File code (4):
  - `src/cart.ts`: `checkLineIds`, `removeLines`;
  - `src/coupon.ts`: `keepCoupon`;
  - `src/page.ts`: chỉ trường `id` của `CartItem`;
  - `src/server.ts`: mã của `SAMPLE_CART`, `checkLineIds` khi tạo server, đọc `remove` và `removed`.
- Tài liệu: `README.md`. Phần `POST /` thêm `remove`, `removed`, và câu "một yêu cầu xóa không đọc `code`". Bước 7 của bảng thứ tự kiểm đổi thành "trang giỏ hàng với các dòng còn lại và mã của form".
- File test:
  - `src/cart.test.ts`, `src/coupon.test.ts`, `src/server.test.ts`;
  - `src/page.test.ts`: chỉ thêm `id` vào dữ liệu;
  - `e2e/remove.spec.ts` (mới).
- Các bước, mỗi bước test đỏ trước:
  1. `checkLineIds`, trong `src/cart.test.ts`:
     - nhận `but-bi`, `so-tay`, và một mã 32 ký tự;
     - ném `RangeError` với mã rỗng, mã 33 ký tự, `BUT-BI`, `bút`, `a b`, hai dòng cùng mã, và một dòng không có `id` (ép kiểu `as unknown as`).
  2. `removeLines`, trong `src/cart.test.ts`:
     - xóa một dòng; xóa hết;
     - mã lạ, mã trùng, mã rỗng bị bỏ qua; `BUT-BI` khác `but-bi`;
     - `constructor`, `__proto__`, `toString`, `hasOwnProperty` là mã lạ;
     - thứ tự các dòng còn lại giữ như giỏ;
     - `removed` theo thứ tự của giỏ, mỗi mã một lần;
     - mảng truyền vào không bị đổi.
  3. `keepCoupon`, trong `src/coupon.test.ts`:
     - `GIAM10` và ` giam10 ` cho `GIAM10`;
     - `''` và `GIAM99` cho không mã;
     - không bao giờ có `rejected`.
  4. Mã dòng của giỏ:
     - thêm `id` vào `CartItem` và `SAMPLE_CART`;
     - thêm `id` vào 7 dòng dữ liệu của `src/page.test.ts` và 1 dòng của `src/server.test.ts`, không đổi assertion hay tên test (SPEC, Tests that change);
     - `cartServer` gọi `checkLineIds`;
     - test: giỏ có mã trùng hay mã rỗng làm `cartServer` ném `RangeError`. Test "a cart the page cannot show…" vẫn ném vì giá âm.
  5. `POST /` có `remove` và `removed`, trong `src/server.test.ts`:
     - mỗi dòng của bảng kết quả ở mục API Contract;
     - AC4 với `start(t, items)` và giỏ 55.000 ₫;
     - gửi lại cùng body cho cùng trang;
     - body 612 byte nhận 200;
     - yêu cầu xóa có `Origin` sai nhận 403, kể cả khi body quá 1.024 byte.
  6. `e2e/remove.spec.ts`: tạo `test.describe('DEMO-20', …)` với AC10 và AC11. Hai test gửi request thô bằng `node:http` tới `baseURL`, với helper `raw` chép từ `e2e/coupon.spec.ts` (quyết định 8).
     - AC10: `Origin: http://evil.example`, rồi không có `Origin`. Cả hai nhận 403, body `Forbidden`, và không có `data-testid="cart-line"`.
     - AC11: trang có hai dòng với đúng tên, đơn giá và số lượng, tạm tính 39.000 ₫ và tổng cộng 42.000 ₫.
  7. Cập nhật README.
- Phụ thuộc: không có.

### Sub-task FE DEMO-23 (`fe-dev`)

- AC: AC1–AC9, phần trang và E2E.
- Design:
  - S1.2: cột thứ năm, tiêu đề ẩn "Thao tác", khung cuộn ngang;
  - S1.3: nút "Xóa";
  - S1.4, S1.5: form mã mang các dòng đã xóa; Enter luôn là "Áp dụng";
  - S1.6: không có thông báo sau khi bấm "Xóa";
  - S1.7–S1.10 giữ `data-testid` hiện có;
  - mục Bố cục theo cỡ màn hình của S1.
- File code (2):
  - `src/page.ts`: tham số `removed`, markup và CSS theo mục API Contract;
  - `src/server.ts`: chỉ dòng nối `removed` vào `renderCart` (quyết định 6).
- File test: `src/page.test.ts`, `src/server.test.ts`, `e2e/cart.spec.ts`, `e2e/remove.spec.ts`.
- Các bước, mỗi bước test đỏ trước:
  1. Đổi bốn test của `src/page.test.ts` theo mục Tests that change của SPEC. Mỗi test giữ nguyên ý nghĩa, và chỉ đổi cách kiểm:
     - "each line shows its name, unit price, quantity and line total": kiểm bốn ô đầu như cũ, rồi tới một ô thứ năm chứa form.
     - "a cart has a coupon form posting to /, …": kiểm `</table>` đứng trước `<label for="coupon-code">`, và `</form>` của form mã đứng trước `<dl>`.
     - "a coupon in force goes back with the form in the hidden field applied": số `name="applied"` bằng số `<form`, tức mỗi form đúng một lần.
     - "the style wraps the button under the field when the row is too narrow, without a media query": luật `form{…display:flex…flex-wrap:wrap}` và `#coupon-code{…flex:1 1 …}` vẫn có. STYLE có đúng một `@media`, và khối của nó không chứa `form` hay `#coupon-code`.
  2. Test mới của `src/page.test.ts`:
     - mỗi dòng có đúng một nút `name="remove"` với `value` là mã dòng và `aria-label="Xóa <tên>"`, trong một form `POST /` riêng;
     - cột thứ năm có `th scope="col"` với chữ ẩn "Thao tác";
     - các mã của `removed` có trong mọi form, mỗi form một lần cho mỗi mã;
     - mã đang áp có trong form của nút "Xóa";
     - mã dòng và tên sản phẩm được escape trong `value` và `aria-label`;
     - form mã không chứa `name="remove"`, và trang không có thuộc tính `form=`;
     - STYLE có `.scroll{overflow-x:auto;position:relative}` và `td form{display:block;margin:0}`.
  3. Thêm tham số `removed` vào `renderCart`, và nối nó ở `src/server.ts`. Test trong `src/server.test.ts`: với body `removed=but-bi&removed=but-bi&removed=khong-co&removed=%3Cscript%3E&code=`, mỗi form của trang có đúng một `name="removed" value="but-bi"`, và trang không chứa `khong-co` hay `script`.
  4. `e2e/cart.spec.ts`, AC1 của DEMO-10: mỗi dòng có năm ô, như `['Bút bi', '5.000 ₫', '3', '15.000 ₫', 'Xóa']`.
  5. `e2e/remove.spec.ts`: thêm AC1–AC9 vào `describe` DEMO-20.
     - Tìm nút bằng vai trò và tên đầy đủ, như "Xóa Bút bi": tên "Xóa" khớp cả hai nút.
     - Đọc kết quả theo `data-testid`.
     - AC4 tự khởi động `cartServer(items)` (quyết định 8).
     - AC9 điền `GIAM10` vào ô mã rồi nhấn Enter.
- Kiểm tay trên Chrome:
  - Ở 320, 360, 768, 1024 và 1440 px, trang không cuộn ngang (`scrollWidth` của trang không lớn hơn độ rộng cửa sổ).
  - Ở 320 px, Tab tới nút "Xóa" thì khung tự cuộn tới nút. Viền focus vẫn hiện.
- Phụ thuộc: Sub-task BE đã commit lên nhánh của Story.

### Verification của Story DEMO-21

```
npm run lint && npm run typecheck && npm test
npm run test:coverage   # at least 80% of changed lines covered
npm run test:e2e        # AC1–AC11 of DEMO-20, AC1–AC11 of DEMO-11, AC1 and AC2 of DEMO-10
```

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Nhấn Enter trong ô mã xóa một dòng, nếu một nút "Xóa" nằm trong form mã hay gắn vào nó bằng `form` | High | Mỗi nút "Xóa" có form riêng (SPEC, Never). Unit test kiểm form mã không có `name="remove"` và trang không có `form=`. E2E AC9 nhấn Enter trên Chrome. |
| Server tin tên, đơn giá, số lượng hay số tiền gửi lên | High | Server chỉ đọc `remove`, `removed`, `code` và `applied`. AC11 (E2E và integration) gửi các trường tự đặt. Reviewer và security kiểm điểm này. |
| Tra mã dòng bằng khóa của object, khiến `constructor` hay `__proto__` trùng một "dòng" | Medium | `removeLines` chỉ dùng `Set`. Unit test và integration test có `constructor`, `__proto__`, `toString`, `hasOwnProperty`. |
| Một dòng thiếu `id` lọt qua `checkLineIds`, vì `LINE_ID.test(undefined)` trả `true` | Medium | Kiểm `typeof` trước (quyết định 3). Unit test có một dòng không có `id`. |
| Trường ẩn ghi lại chuỗi gửi lên, mở đường cho XSS | Medium | `removeLines` trả mã lấy từ giỏ server, và mọi mã qua `escapeHtml`. Integration test gửi `removed=%3Cscript%3E`. |
| Đổi bốn unit test và AC1 của DEMO-10 làm mất ý nghĩa của chúng | Medium | Plan ghi cách kiểm mới cho từng test (Sub-task FE, bước 1). Reviewer so với bảng Tests that change của SPEC. |
| E2E chưa chạy trong CI | Medium | Mỗi checkpoint chạy `npm run test:e2e` trên máy. `qa` chạy lại khi verify. |
| Sub-task BE thêm tham số `renderCart` không dùng, và pre-commit fail | Low | Sub-task FE thêm tham số này (quyết định 6). |
| Hai Sub-task cùng sửa `src/page.ts` và `src/server.ts` trên một nhánh | Low | BE làm trước. BE chỉ thêm `id` ở `src/page.ts`; FE chỉ đổi một dòng ở `src/server.ts`. |
| Server của AC4 không được đóng, và worker của Playwright treo | Low | Đóng trong `finally` bằng `closeAllConnections()` rồi `close()` (quyết định 8). |
| Giới hạn body chặn số dòng đã xóa: khoảng 28 dòng với mã 6 ký tự | Low | Giỏ có hai dòng. Mã giới hạn 32 ký tự ASCII. Giỏ lớn hơn cần ADR mới (ADR-0002, Consequences). |
| Chữ ẩn "Thao tác" thoát khỏi khung và trang cuộn ngang ở 320 px | Low | `.scroll{position:relative}`. Kiểm tay ở 320 px. |
| Bấm đúp xóa hai dòng, vì dòng kế tiếp dời lên chỗ nút vừa bấm | Low | Đã chấp nhận ngày 2026-11-01 (design, S1.3). Mở lại `/` có lại giỏ mẫu. |
| Chưa thử với trình đọc màn hình, và trang không có câu báo sau khi xóa | Low | `qa` nghe thử một lần (design, S1.3). |
| Agent tìm tài liệu trên `develop` trước khi PR #15 merge, và không thấy | Low | Quyết định 10 ghi lệnh `git show`. `ba` chép lệnh này vào mô tả của Story. |

## Open Questions

Không còn câu hỏi mở.

- Plan chốt các đề xuất của SPEC mà không đổi: tên trường `remove` và `removed`, mã dòng `[a-z0-9-]{1,32}`, mã của `SAMPLE_CART`. Vì vậy SPEC không phải sửa.
- Effort được trả lời trước gate ②, ngày 2026-11-01: bạn nâng DEMO-22 lên `xhigh`, và DEMO-23 giữ effort mặc định. Câu trả lời đã thành quyết định 11 và dòng của DEMO-22 trong Task List. `ba` đã thêm nhãn `ao-effort-xhigh` cho DEMO-22 trên Jira.
