# Spec: Mã giảm giá cho giỏ hàng

> **Epic:** DEMO-11 · **Jira:** https://phunghuutung12b4.atlassian.net/browse/DEMO-11 · **Status:** Draft

## Objective

Người mua nhập một mã giảm giá trên trang giỏ hàng (DEMO-10) và thấy ngay số tiền được giảm cùng tổng cộng mới. Mã không hợp lệ thì trang báo lỗi và tổng cộng giữ nguyên.

Đây là lần đầu trang nhận dữ liệu từ người dùng. Vì vậy Epic gồm cả ba ghi chú security và hai finding Low của reviewer từ review PR #9 (DEMO-10).

Thành công nghĩa là, trên giỏ hàng mẫu:

- người mua áp được mã đúng và thấy tổng cộng mới;
- mã sai không làm đổi tổng cộng;
- server từ chối request đến từ trang khác hoặc gửi tới một `Host` lạ.

Những chỗ Epic chưa nói, SPEC điền bằng đề xuất của `ba` và ghi mã câu hỏi (Q1–Q7) ở mục Open Questions. Các đề xuất đó chờ bạn quyết ở gate ①.

### Scope

Trong phạm vi (theo Epic):

- Một ô nhập mã và một nút "Áp dụng" trên trang giỏ hàng.
- Danh sách mã cố định trong code. Không có cơ sở dữ liệu, không có trang quản trị mã.
- Mỗi giỏ dùng tối đa một mã: áp mã mới thì mã cũ bị thay.

Ngoài phạm vi:

- Theo Epic: đăng nhập, lưu giỏ hàng, thanh toán.
- Đề xuất (Q4): giữ mã đã áp khi tải lại trang, nút bỏ mã.
- Đề xuất (Q1): điều kiện đơn tối thiểu, hạn dùng và số lượt dùng của mã.

### Business rules

Danh sách mã (Q1):

| Mã | Loại | Mức giảm |
|---|---|---|
| `GIAM10` | Phần trăm | 10% tạm tính, làm tròn xuống tới đồng (Q2) |
| `GIAM20K` | Số tiền | 20.000 ₫, không vượt quá tạm tính |

- Tiền tính bằng số nguyên đồng, như `src/cart.ts`.
- Trước khi so với danh sách, mã được bỏ khoảng trắng ở hai đầu và đổi sang chữ hoa. Trang hiện mã ở dạng chữ hoa (Q3).
- Số tiền giảm tính trên tạm tính và không lớn hơn tạm tính, để tổng cộng không âm.
- Phí vận chuyển vẫn tính trên tạm tính trước giảm, nên `shipping()` của `src/cart.ts` không đổi (Q2).
- Tổng cộng = tạm tính − số tiền giảm + phí vận chuyển.
- Server tính lại số tiền giảm từ danh sách mã ở mỗi request. Server không tin bất kỳ số tiền nào gửi lên từ form.
- Nhập mã sai khi đang có mã đúng thì mã đúng được giữ (AC7, Q4).
- Giỏ hàng trống không có ô nhập mã.
- Ô mã không dùng thuộc tính `required`. Server tự kiểm và báo lỗi, nên mọi trình duyệt hiện cùng một thông báo (AC6).

Thông báo (Q6):

- Mã không có trong danh sách: "Mã giảm giá không hợp lệ."
- Ô mã trống sau khi bỏ khoảng trắng: "Vui lòng nhập mã giảm giá."

### User stories

Các AC dùng giỏ hàng mẫu `SAMPLE_CART` của `src/server.ts`: tạm tính 39.000 ₫, phí vận chuyển 3.000 ₫, tổng cộng 42.000 ₫.

Số tiền giảm hiện kèm dấu trừ. Tôi đã chạy `formatMoney(-3900)` của `src/page.ts` trên Node 24.17.0: kết quả là "-3.900 ₫", với dấu gạch nối ASCII và một no-break space trước ₫.

**Story 1.** Là người mua, tôi muốn nhập mã giảm giá trên trang giỏ hàng để thấy ngay số tiền được giảm và tổng cộng mới.

- AC1: Given giỏ hàng mẫu chưa áp mã, When nhập `GIAM10` và bấm "Áp dụng", Then trang hiện dòng giảm giá của `GIAM10` là "-3.900 ₫", tạm tính vẫn 39.000 ₫, phí vận chuyển vẫn 3.000 ₫, và tổng cộng là 38.100 ₫.
- AC2: Given giỏ hàng mẫu chưa áp mã, When nhập `GIAM20K` và bấm "Áp dụng", Then dòng giảm giá là "-20.000 ₫" và tổng cộng là 22.000 ₫.
- AC3: Given giỏ hàng mẫu chưa áp mã, When nhập `  giam10  ` (chữ thường, có khoảng trắng ở hai đầu) và bấm "Áp dụng", Then trang hiện mã là `GIAM10`, dòng giảm giá là "-3.900 ₫", và tổng cộng là 38.100 ₫.
- AC4: Given đã áp `GIAM10`, When nhập `GIAM20K` và bấm "Áp dụng", Then trang chỉ có một dòng giảm giá, của `GIAM20K`, là "-20.000 ₫", và tổng cộng là 22.000 ₫.

**Story 2.** Là người mua, tôi muốn được báo rõ khi mã không dùng được, để sửa lại mà không mất khoản giảm đang có.

- AC5: Given giỏ hàng mẫu chưa áp mã, When nhập `SAIMA` và bấm "Áp dụng", Then thấy "Mã giảm giá không hợp lệ.", không có dòng giảm giá, tổng cộng vẫn là 42.000 ₫, và ô mã vẫn chứa `SAIMA` để sửa.
- AC6: Given giỏ hàng mẫu chưa áp mã, When để trống ô mã và bấm "Áp dụng", Then thấy "Vui lòng nhập mã giảm giá." và tổng cộng vẫn là 42.000 ₫.
- AC7: Given đã áp `GIAM10` (tổng cộng 38.100 ₫), When nhập `SAIMA` và bấm "Áp dụng", Then thấy "Mã giảm giá không hợp lệ.", dòng giảm giá của `GIAM10` vẫn là "-3.900 ₫", và tổng cộng vẫn là 38.100 ₫.
- AC8: Given giỏ hàng mẫu chưa áp mã, When nhập `"><b>x</b>` và bấm "Áp dụng", Then thấy "Mã giảm giá không hợp lệ.", ô mã chứa đúng chuỗi `"><b>x</b>` dưới dạng chữ, và trang không có phần tử `b` nào.

**Story 3.** Là chủ shop, tôi muốn server chỉ nhận mã giảm giá gửi từ chính trang giỏ hàng và chỉ trả lời đúng địa chỉ của nó, để một trang web khác không gửi form hay đọc trang thay người mua được.

- AC9: Given một request `POST /` có `Origin` khác địa chỉ của server (như `http://evil.example`) hoặc không có `Origin`, When server nhận request, Then server trả 403 và không trả trang giỏ hàng.
- AC10: Given một request `POST /` có body lớn hơn 1.024 byte (Q5), When server nhận request, Then server trả 413, và sau đó vẫn trả 200 cho `GET /`.
- AC11: Given một request có `Host` khác `127.0.0.1:<port>` và `localhost:<port>`, hoặc không có `Host`, When gửi `GET /` hoặc `POST /`, Then server trả 400 và không trả trang giỏ hàng.

### Technical requirements

Các yêu cầu sau không phải user story. Plan có thể gom chúng vào Story liên quan, hoặc tách thành Task khi đó là phần nền dùng chung.

- Form gửi `POST /` dạng `application/x-www-form-urlencoded`. Đây là đề xuất; `sa` chốt hợp đồng trong plan.
- Server không đặt cookie và không lưu trạng thái. Mã đang áp đi kèm form, ví dụ trong một trường ẩn, để AC4 và AC7 làm được mà không cần lưu gì. Server kiểm lại mã đó như mọi mã khác.
- `GET /` không kèm mã vẫn trả đúng trang như hôm nay, nên hai E2E của DEMO-10 (`e2e/cart.spec.ts`) vẫn phải pass.
- `POST /` trở thành method hợp lệ. Mọi method khác `GET`, `HEAD`, `POST` nhận 405 với `Allow: GET, HEAD, POST`. Test "another method is 405" trong `src/server.test.ts` đổi theo.
- Thứ tự kiểm ở server:
  - `Host` được kiểm trước mọi bước khác, kể cả trước 404.
  - `Origin` được kiểm trước khi đọc body.
  - Body được đọc có giới hạn, kể cả khi request không có `Content-Length`.
- Câu trả lời 400, 403 và 413 là `text/plain; charset=utf-8`, có `X-Content-Type-Options: nosniff` và body cố định, như 404 và 405 hiện có.
- CSP giữ nguyên: không script, `form-action 'self'`.
- Mã người dùng nhập, khi hiện lại trong thông báo hay trong `value="…"`, đi qua `escapeHtml` của `src/page.ts`. Thuộc tính luôn có dấu nháy.
- Từ review PR #9 (reviewer, Low): mọi request trong `src/server.test.ts` có timeout, như `AbortSignal.timeout` cho `fetch` và một timeout cho `rawGet`. Khi server sập, test phải fail chứ không treo.
- Từ review PR #9 (reviewer, Low): `package-lock.json` ghi `engines.node` là `">=24.2"`, khớp `package.json`. Lệnh sửa: `npm install --package-lock-only`.

## Tech Stack

Không thêm dependency. Epic dùng những gì đã có trong `package.json`:

- Node `>=24.2`, TypeScript 6.0.3;
- `node:http` cho server, `node:test` cho unit và integration test;
- `@playwright/test` 1.64.1, chạy với Chrome cài trên máy.

Trang vẫn dựng ở server, không framework, không script phía client.

## Commands

Không đổi so với README:

```
npm run lint          # eslint .
npm run typecheck     # tsc --noEmit
npm test              # unit và integration test: node --test "src/**/*.test.ts"
npm run test:coverage # như trên, kèm lcov ở coverage/lcov.info
npm run test:e2e      # Playwright E2E; server tự chạy trên port 3100
npm run serve         # trang trên http://127.0.0.1:3000/ (PORT đổi port)
```

## Project Structure

Đề xuất; `sa` chốt danh sách file trong plan.

```
src/coupon.ts        → danh sách mã, chuẩn hóa mã, tính số tiền giảm (mới)
src/coupon.test.ts   → unit test của coupon.ts (mới)
src/page.ts          → form mã giảm giá, dòng giảm giá, thông báo lỗi
src/server.ts        → POST /, kiểm Host, Origin và cỡ body
src/*.test.ts        → unit và integration test, cạnh file nguồn như hiện nay
e2e/coupon.spec.ts   → E2E cho AC1–AC11 (mới)
docs/specs/DEMO-11/  → spec.md (file này), design.md của ux, plan.md của sa
README.md            → thêm POST / và danh sách mã
```

## Code Style

Repo chưa có `CLAUDE.md`, nên Epic theo code hiện có. Ví dụ từ `src/cart.ts`:

```ts
const SHIPPING_FEE = 3000;
const FREE_SHIPPING_FROM = 50000;

// The shipping fee of a cart, in the currency's smallest unit: free from 50000, nothing for an empty cart.
export function shipping(lines: Line[]): number {
  const sum = total(lines);
  return sum > 0 && sum < FREE_SHIPPING_FROM ? SHIPPING_FEE : 0;
}
```

- Code, comment và tên test viết bằng tiếng Anh; chữ hiện trên trang viết bằng tiếng Việt.
- Hằng số viết hoa. Tiền là số nguyên đồng, và comment nói rõ đơn vị.
- Import ghi đuôi `.ts`.
- `tsconfig.json` bật `erasableSyntaxOnly`, nên không dùng `enum` hay parameter property. Loại mã là một union, như `'percent' | 'amount'`.
- Hàm thuần ném `RangeError` khi nhận đầu vào sai về kiểu, như `total()`. Mã người dùng nhập sai là kết quả bình thường: hàm trả về "không hợp lệ" và không ném lỗi.
- Chuỗi tự do đưa vào HTML luôn đi qua `escapeHtml`.

## Testing Strategy

Mọi Story viết theo TDD: test đỏ trước, code sau.

**Unit test** (`node:test`, cạnh file nguồn):

- `src/coupon.test.ts`:
  - chuẩn hóa mã (khoảng trắng, chữ thường);
  - mã không có trong danh sách, và mã trống;
  - giảm phần trăm làm tròn xuống: 10% của 12.345 là 1.234;
  - giảm số tiền không vượt tạm tính: `GIAM20K` trên tạm tính 15.000 giảm 15.000.
- `src/page.test.ts`:
  - form và nút "Áp dụng";
  - dòng giảm giá, và tổng cộng sau giảm;
  - hai thông báo lỗi;
  - escape mã trong thông báo và trong `value="…"`;
  - giỏ hàng trống không có form.

**Integration test** (`src/server.test.ts`, server thật trên một port tự do của 127.0.0.1, mọi request có timeout):

- `POST /` với mã đúng, mã sai và mã trống.
- `Origin` khác, thiếu, hoặc là `null` → 403.
- `Host` lạ, và request HTTP/1.0 không có `Host` → 400, kể cả với path không tồn tại.
- Body quá giới hạn, có và không có `Content-Length` → 413, và server vẫn trả lời request sau.
- `PUT /` → 405 với `Allow: GET, HEAD, POST`.

**E2E test** (`e2e/coupon.spec.ts`, Playwright với Chrome): mỗi AC từ AC1 đến AC11 có một test, tên bắt đầu bằng mã AC.

- AC1–AC8 đi qua trang: điền ô mã, bấm "Áp dụng", rồi đọc các phần tử theo `data-testid`.
- AC9–AC11 cần đặt `Origin`, `Host` hoặc body tùy ý, việc mà một trang trong trình duyệt không làm được. Vì vậy các test này gửi request HTTP thô bằng `node:http` tới server do Playwright khởi động.
- [Unverified] Request fixture của Playwright có thể đặt được `Origin`. Tôi chưa kiểm nó có đặt được `Host` không.
- Theo README, E2E chưa chạy trong CI; `qa` chạy chúng trên máy.

**Coverage:** quality gate của kit đòi ít nhất 80% số dòng thay đổi được phủ (`changed_lines_min: 80` trong `.ai-orchestrator/quality/gates.yaml`).

## Boundaries

- **Always:**
  - Tính lại số tiền giảm ở server, từ danh sách mã, ở mỗi request.
  - Tính tiền bằng số nguyên đồng.
  - Escape mọi chuỗi người dùng nhập trước khi đưa vào HTML, và luôn đặt thuộc tính trong dấu nháy.
  - Kiểm `Host` trước mọi bước khác, kiểm `Origin` trước khi đọc body, và đọc body có giới hạn.
  - Viết test trước code. Tên E2E bắt đầu bằng mã AC.
- **Ask first:**
  - Thêm dependency.
  - Đổi CSP, hoặc đổi địa chỉ hay port mà server nghe.
  - Thêm cookie, session hay bất kỳ cách lưu trạng thái nào.
  - Thêm hoặc bớt mã, đổi mức giảm, hoặc đổi quy tắc phí vận chuyển.
  - Đổi câu chữ của thông báo đã chốt trong AC.
- **Never:**
  - Thêm JavaScript phía client.
  - Tin số tiền, phần trăm hay tổng cộng gửi lên từ form.
  - Ghi mã người dùng nhập, hoặc body của request, vào log.
  - Sửa `.ai-orchestrator/**`, `.claude/**` hay `.githooks/**`.

## Success Criteria

Các điều kiện sau cộng thêm vào Epic DoD. Epic DoD nằm trong `.ai-orchestrator/contract/work-items.yaml`, vì repo chưa có `docs/sdlc.md`.

- Ba Story đạt Story DoD: E2E của AC1–AC11 pass trên Chrome.
- Hai E2E của DEMO-10 (`e2e/cart.spec.ts`) vẫn pass, tức `GET /` không kèm mã vẫn ra trang như cũ.
- Ba ghi chú security của review PR #9 đã được xử lý:
  - CSRF và cỡ body: AC9, AC10;
  - DNS rebinding: AC11;
  - escape mã: AC8.
- Review security không còn finding Critical hay High.
- Hai finding Low của reviewer trên PR #9 đã được xử lý:
  - Với một `server.ts` làm listener ném lỗi, `npm test` kết thúc và báo test fail, thay vì treo.
  - `package-lock.json` ghi `engines.node` là `">=24.2"`.
- `npm run lint`, `npm run typecheck` và `npm test` xanh. Ít nhất 80% số dòng thay đổi được phủ.

## Open Questions

Phiên này không có ai trả lời, nên mỗi câu hỏi kèm câu trả lời tôi đề xuất, và SPEC đã viết theo đề xuất đó. Nếu bạn đổi một đề xuất, các AC liên quan đổi theo.

1. **Q1 — Danh sách mã.** Epic không nêu mã nào.
   - Đề xuất: `GIAM10` giảm 10% tạm tính, `GIAM20K` giảm 20.000 ₫ (AC1–AC4).
   - Mã không có điều kiện đơn tối thiểu, hạn dùng hay số lượt dùng.
2. **Q2 — Làm tròn và phí vận chuyển.**
   - Đề xuất: giảm phần trăm làm tròn xuống tới đồng.
   - Đề xuất: phí vận chuyển, gồm cả ngưỡng miễn phí 50.000 ₫, vẫn tính trên tạm tính trước giảm, nên `shipping()` không đổi.
   - Trên giỏ hàng mẫu, hai cách tính phí cho cùng kết quả. Chúng chỉ khác nhau khi tạm tính từ 50.000 ₫ trở lên nhưng sau giảm thì dưới 50.000 ₫.
3. **Q3 — Chữ hoa, chữ thường và khoảng trắng.** Đề xuất: bỏ khoảng trắng ở hai đầu và không phân biệt hoa thường (AC3).
4. **Q4 — "Tổng cộng giữ nguyên" khi đã có mã đúng.** Epic không nói trường hợp nhập mã sai sau một mã đúng.
   - Đề xuất: giữ mã đúng đang áp (AC7). Server không lưu gì; mã đang áp đi kèm form.
   - Nếu bạn bỏ AC7: nhập mã sai luôn đưa trang về trạng thái không giảm giá.
   - Đề xuất để ngoài phạm vi: giữ mã khi tải lại trang (cần cookie, gần với "lưu giỏ hàng" mà Epic loại ra), và nút bỏ mã (Epic chỉ nêu một ô và một nút).
5. **Q5 — CSRF và cỡ body.** Epic cho chọn giữa kiểm Origin và token CSRF.
   - Đề xuất: `Origin` phải trùng `http://<Host của request>`, và thiếu `Origin` cũng nhận 403. Cách này không cần lưu token.
   - [Unverified] Tôi cho rằng Chrome gửi `Origin` với mọi form `POST`. E2E của AC1 chạy trên Chrome, nên sẽ fail nếu điều này sai.
   - [Inference] Với thiết kế không lưu trạng thái, một form giả từ trang khác hôm nay không làm thay đổi gì trên server. Kiểm Origin vẫn được giữ, vì Epic yêu cầu, và để server đã sẵn sàng nếu sau này giỏ hàng có lưu trữ.
   - Đề xuất giới hạn body 1.024 byte (AC10), vì một mã chỉ dài vài chục byte.
6. **Q6 — Câu chữ trên trang.**
   - Đề xuất: nhãn nút "Áp dụng", và hai thông báo ở mục Business rules.
   - Epic đụng tới giao diện, nên `ux` viết `docs/specs/DEMO-11/design.md`. `ux` có thể đổi câu chữ, hoặc vị trí dòng giảm giá. Khi đó AC phải được sửa theo trước gate ①.
7. **Q7 — Tên E2E bị trùng.** `e2e/cart.spec.ts` của DEMO-10 đã có hai test tên `AC1 …` và `AC2 …`.
   - Đề xuất: đặt E2E của Epic này trong `test.describe('DEMO-11', …)` ở `e2e/coupon.spec.ts`, để báo cáo QA phân biệt được hai bộ. Tên test vẫn bắt đầu bằng mã AC.
