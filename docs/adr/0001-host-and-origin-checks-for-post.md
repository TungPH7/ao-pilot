# ADR-0001: Bảo vệ `POST /` bằng kiểm `Host` và `Origin`, server không lưu trạng thái

> **Epic:** DEMO-11 · **Jira:** https://phunghuutung12b4.atlassian.net/browse/DEMO-11

## Status

Proposed

## Date

2026-10-31

## Context

Epic DEMO-11 thêm form mã giảm giá vào trang giỏ hàng. Đây là lần đầu server nhận dữ liệu từ người dùng (`POST /`). Review security của PR #9 (DEMO-10) ghi ba điểm cho lúc này:

- CSRF: `form-action 'self'` không chặn trang khác gửi form vào server.
- DNS rebinding: server trả lời mọi `Host`, nên một trang độc hại đọc được trang này.
- Mã người dùng nhập hiện lại trên trang phải được escape.

Ràng buộc của SPEC đã duyệt ở gate ① ngày 2026-10-31:

- Không cookie, không session, không lưu trạng thái. Thêm cách lưu trạng thái thuộc mục Ask first.
- Không JavaScript phía client. CSP không cho script.
- Server chỉ nghe `127.0.0.1`, và Epic không đổi địa chỉ đó.
- Không thêm dependency.

## Decision

Server kiểm `Host` trước mọi bước khác, rồi kiểm `Origin` của `POST /` trước khi đọc body, và không giữ trạng thái giữa các request:

- `Host`: request phải có đúng một header `Host`, bằng nguyên chuỗi `127.0.0.1:<port>` hoặc `localhost:<port>`, với `<port>` là port server đang nghe. Sai thì trả 400 "Bad request", kể cả với path không tồn tại. Server tạo bằng `createServer({ requireHostHeader: false })`, để code của server trả 400 này cả khi request HTTP/1.1 thiếu `Host`.
- `Origin`: `POST /` phải có `Origin` bằng nguyên chuỗi `http://<Host của request>`. Thiếu `Origin`, `Origin: null`, hai header `Origin`, hay origin khác đều nhận 403 "Forbidden". Không dùng token CSRF.
- Trạng thái: mã đang áp đi kèm form, trong trường ẩn `applied`. Server kiểm lại mã đó theo danh sách mã ở mỗi request, như mọi mã khác, và không bao giờ đọc số tiền từ form.

## Alternatives Considered

### Token CSRF (synchronizer token hoặc double-submit cookie)

- Pros: không phụ thuộc trình duyệt có gửi `Origin` hay không.
- Cons: cần lưu token ở server, hoặc cần cookie, hoặc cần một khóa bí mật để ký token. SPEC cấm cookie và session, và một khóa bí mật là thứ mới phải quản lý.
- Rejected: trái ràng buộc không lưu trạng thái. Với một server chỉ nghe `127.0.0.1`, kiểm `Origin` là đủ.

### Cookie `SameSite`

- Pros: trình duyệt tự chặn cookie trong request cross-site.
- Cons: Epic không có cookie nào để bảo vệ. Thêm cookie chỉ để chống CSRF là thêm trạng thái.
- Rejected: trái ràng buộc không cookie.

### Header `Sec-Fetch-Site` (Fetch Metadata)

- Pros: trình duyệt đặt header này, trang khác không giả được.
- Cons: [Unverified] Tôi chưa kiểm trình duyệt nào ngoài Chrome có gửi header này, và chưa kiểm Chrome gửi gì khi submit form. SPEC đã chốt `Origin`, và người duyệt đã xác nhận Chrome gửi `Origin` với form `POST` cùng origin.
- Rejected cho Epic này. Có thể thêm sau như lớp thứ hai, qua một ADR mới.

### Không kiểm `Host`, chỉ kiểm `Origin`

- Pros: ít code hơn.
- Cons: DNS rebinding làm trang độc hại có cùng origin với server. `Origin` khi đó vẫn khớp `http://<Host>`, nên kiểm `Origin` không chặn được.
- Rejected: danh sách `Host` cho phép là thứ chặn DNS rebinding.

## Consequences

- Trang không bao giờ được đặt `Referrer-Policy: no-referrer`, bằng header hay thẻ `<meta>`. Khi đó Chrome gửi `Origin: null`, và server trả 403 cho form của chính trang (mục Never của SPEC). Integration test giữ điều này.
- Client không phải trình duyệt phải tự gửi `Origin`. `fetch` của Node không tự gửi `Origin`: tôi chạy trên Node 24.17.0 ngày 2026-10-31, và một `POST /` không đặt header này nhận 403. Test phải đặt `Origin` khi gửi.
- Test của `Host` phải dùng `node:http` hoặc `node:net`, không dùng `fetch`. Cùng ngày, trên Node 24.17.0, `fetch` với header `Host: evil.example` vẫn nhận 200, tức header tự đặt không tới server.
- Đổi địa chỉ hay port mà server nghe, hay chạy sau một proxy hoặc qua HTTPS, đòi xem lại danh sách `Host` và scheme `http://` của `Origin`. Những thay đổi này thuộc mục Ask first.
- Khi dự án thêm đăng nhập, cookie hay thanh toán (ngoài phạm vi DEMO-11), cần một ADR mới để xem lại cách chống CSRF này.
- Một trang tải lại không giữ mã đã áp, vì server không lưu gì. SPEC đã để việc này ngoài phạm vi.
