# ADR-0003: Server nhận Host và Origin công khai của `AO_PUBLIC_URL` khi đứng sau Caddy

> **Epic:** none · **Jira:** https://phunghuutung12b4.atlassian.net/browse/DEMO-26

## Status

Proposed with DEMO-26; it takes effect when you approve and merge its PR

## Date

2026-11-06

## Context

Deployer của kit build `ao-pilot` thành image Docker và chạy trên VPS cho ba môi trường: Development tại `https://pilot-dev.ao.t2g.io.vn`, Staging và Production. Caddy đứng trước container, giữ HTTPS và basic auth, và chuyển nguyên Host công khai tới app. Smoke test của deployer cũng gửi Host đó.

Quy tắc hiện có, từ DEMO-11 (ADR-0001, chỉ có trên nhánh `feature/DEMO-11-spec`, đọc bằng `MSYS_NO_PATHCONV=1 git show origin/feature/DEMO-11-spec:docs/adr/0001-host-and-origin-checks-for-post.md`):

- Request phải có đúng một header `Host`, bằng nguyên chuỗi `127.0.0.1:<port>` hoặc `localhost:<port>`; khác thì trả 400, trước mọi bước khác (AC11). Quy tắc này chặn DNS rebinding: một trang đổi tên miền của nó sang 127.0.0.1 vẫn gửi Host là tên miền đó.
- `POST /` phải có `Origin` bằng `http://<Host>`; khác hoặc thiếu thì trả 403 trước khi đọc body (AC9). Quy tắc này chống CSRF mà không cần cookie hay token.
- Server chỉ nghe trên `127.0.0.1`.

Với quy tắc đó, mọi request qua Caddy đều bị 400, vì Host là `pilot-dev.ao.t2g.io.vn`. Một `POST /` từ trang tải qua HTTPS mang `Origin: https://pilot-dev.ao.t2g.io.vn`, không phải `http://<Host>`, nên cũng bị 403. Trong container, server phải nghe trên `0.0.0.0` để Caddy gọi tới.

## Decision

`npm run serve` nghe trên `HOST` (mặc định `127.0.0.1`) và `PORT` (mặc định `3000`). Khi có biến `AO_PUBLIC_URL`, server nhận thêm đúng một cặp: Host bằng nguyên chuỗi host của URL đó, và với Host này, Origin bằng nguyên chuỗi origin của URL đó.

- `AO_PUBLIC_URL` phải là một origin `http` hoặc `https`, có thể có `/` ở cuối, không có path khác, query, fragment hay user. Sai thì server dừng ngay lúc khởi động (`RangeError`), không chạy rồi từ chối mọi request. Biến rỗng tính như không có.
- Host công khai lấy từ `URL.host`: chữ thường, bỏ port mặc định. Ví dụ `https://pilot-dev.ao.t2g.io.vn` cho Host `pilot-dev.ao.t2g.io.vn` và Origin `https://pilot-dev.ao.t2g.io.vn`.
- Origin đi theo Host: Host `127.0.0.1:<port>` hay `localhost:<port>` vẫn chỉ nhận `http://<Host>`; Host công khai chỉ nhận origin công khai. Origin công khai gửi kèm Host của máy vẫn 403.
- Không có `AO_PUBLIC_URL` thì hành vi giữ nguyên như ADR-0001. Host hay Origin khác vẫn bị từ chối như AC9, AC11 của DEMO-11.

## Alternatives Considered

### Tin header `X-Forwarded-Host` và `X-Forwarded-Proto` từ Caddy

- Pros: server không cần biết URL công khai; một image dùng cho mọi tên miền.
- Cons: server phải tin rằng chỉ Caddy gọi tới nó. Ai tới thẳng cổng của container cũng đặt được hai header đó, nên quy tắc Host không còn chặn gì. Caddy mặc định vẫn chuyển nguyên Host, nên vẫn phải sửa phần kiểm Host.
- Rejected: dời việc kiểm sang một header dễ giả hơn.

### Caddy viết lại Host thành `127.0.0.1:3000` và bỏ hay sửa Origin

- Pros: không sửa code của app.
- Cons: cấu hình Caddy của deployer phải riêng cho app này, và smoke test của deployer gửi Host công khai. Sửa Origin ở proxy thì app không còn tự chống CSRF.
- Rejected: deployer của kit dùng chung một cách cho mọi dự án, và app phải tự giữ hai quy tắc của nó.

### Nhận mọi Host khi nghe trên `0.0.0.0`

- Pros: đơn giản nhất.
- Cons: bỏ chặn DNS rebinding, trái AC11.
- Rejected: trái tiêu chí đã duyệt.

### Danh sách nhiều Host, Origin công khai

- Pros: một container phục vụ được nhiều tên miền.
- Cons: mỗi môi trường chỉ có một URL; danh sách mở rộng thứ phải kiểm.
- Rejected: chưa cần. Khi cần thì viết ADR mới.

## Consequences

- Deployer đặt `HOST=0.0.0.0`, `PORT=3000` và `AO_PUBLIC_URL=<URL của môi trường>` cho container. Thiếu `AO_PUBLIC_URL` thì mọi request qua Caddy bị 400, và smoke test của deployer thấy ngay.
- URL công khai phải viết đúng như trình duyệt và Caddy dùng. Caddy phải chuyển nguyên Host (mặc định của `reverse_proxy`), không thêm port.
- Server tin Caddy giữ HTTPS và basic auth; container không mở cổng ra ngoài ngoài cho Caddy. Server không đọc header `X-Forwarded-*`.
- E2E chạy vào URL của môi trường (`E2E_BASE_URL`) dùng đúng Host và Origin công khai. Các test cần gửi Host hay Origin lạ (tag `@local`) vẫn chạy vào server tại chỗ, vì Caddy và trình duyệt không chuyển được các request đó.
- Đổi tên miền của một môi trường chỉ cần đổi `AO_PUBLIC_URL`, không build lại image.
