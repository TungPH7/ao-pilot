# ADR-0002: Giỏ còn lại đi theo form bằng mã dòng cố định, server không lưu trạng thái

> **Epic:** DEMO-20 · **Jira:** https://phunghuutung12b4.atlassian.net/browse/DEMO-20

## Status

Proposed with the plan of DEMO-20; it takes effect when you approve the plan at gate ②

## Date

2026-11-01

## Context

Epic DEMO-20 cho người mua xóa một dòng khỏi giỏ hàng. Sau một lần xóa, request kế tiếp (xóa thêm một dòng, hay áp mã) phải biết những dòng nào đã bị xóa.

Ràng buộc của SPEC đã duyệt ở gate ①:

- Server không lưu trạng thái: không cookie, không session, không file. Thêm cách lưu trạng thái thuộc mục Ask first. Lưu giỏ giữa các lần tải trang nằm ngoài phạm vi.
- Không JavaScript phía client, CSP giữ nguyên. Body của `POST /` tối đa 1.024 byte.
- Form không đổi được giá hay số lượng: mọi con số tính từ giỏ của server, ở mỗi request (AC11).
- Tải lại trang sau khi xóa gửi lại cùng form, và không được xóa thêm dòng nào.
- `GET /` luôn trả giỏ mẫu đủ, và query string không đổi trang (test hiện có "a query string does not change the page").

Cách làm hiện có, từ DEMO-11: mã đang áp đi theo form trong trường ẩn `applied`, và server kiểm lại mã đó ở mỗi request. ADR-0001 ghi cách làm này cùng bước kiểm `Host` và `Origin`. ADR-0001 chỉ có trên nhánh `feature/DEMO-11-spec`; đọc bằng `MSYS_NO_PATHCONV=1 git show origin/feature/DEMO-11-spec:docs/adr/0001-host-and-origin-checks-for-post.md`.

Tới nay một dòng của giỏ chỉ có tên, đơn giá và số lượng (`CartItem`). Đây là lần đầu một dòng cần một mã để form gọi tới nó.

## Decision

Giỏ còn lại đi theo form dưới dạng mã dòng, như mã đang áp đi trong `applied`. Server tính lại mọi thứ từ giỏ của nó ở mỗi request.

- **Mã dòng.** Mỗi dòng của giỏ server có `id` cố định (`CartItem.id`, bắt buộc), gồm 1 đến 32 ký tự `a`–`z`, `0`–`9` và `-`, không trùng trong một giỏ. Mã không phải vị trí của dòng. Giỏ vi phạm làm `cartServer(items)` ném `RangeError` khi tạo server. `SAMPLE_CART` có `but-bi` và `so-tay`.
- **Form.** Nút "Xóa" của mỗi dòng gửi `remove=<mã dòng>`. Mọi form của trang gửi một trường ẩn `removed=<mã dòng>` cho mỗi dòng đã xóa trước đó, cùng `applied` như hôm nay.
- **Server.** Ở mỗi `POST /`, server lấy giỏ của nó, bỏ các dòng có mã nằm trong `removed` hoặc bằng `remove`, rồi tính tạm tính, phí vận chuyển, giảm giá và tổng cộng trên các dòng còn lại.
  - Mã được so nguyên chuỗi, và tra bằng `Set`, không bằng khóa của object.
  - Mã lạ, trùng hay rỗng bị bỏ qua.
  - Trang trả về chỉ ghi lại mã dòng lấy từ giỏ server, không ghi chuỗi gửi lên.

## Alternatives Considered

### Cookie hoặc session

- Pros: form không dài thêm theo số dòng đã xóa. Giỏ còn lại giữ được qua một lần mở lại `/`.
- Cons: thêm trạng thái ở server hoặc trong cookie, trái ràng buộc của SPEC (Ask first). Có cookie thì cách chống CSRF của ADR-0001 phải xem lại. Lưu giỏ giữa các lần tải trang nằm ngoài phạm vi.
- Rejected: trái ràng buộc không lưu trạng thái.

### Vị trí của dòng trong giỏ

- Pros: `CartItem` không thêm trường nào, dữ liệu test không đổi.
- Cons: vị trí trỏ tới dòng khác khi thứ tự của giỏ server đổi. Một trang đang mở lúc đó sẽ xóa nhầm dòng.
- Rejected: câu Q5 của SPEC (ngày 2026-11-01) chọn mã cố định. Với mã cố định, mã cũ chỉ là mã lạ và bị bỏ qua.

### Gửi cả giỏ còn lại trong form (tên, đơn giá, số lượng)

- Pros: server không cần biết giỏ.
- Cons: form quyết định số tiền, trái AC11. Body dài theo tên sản phẩm.
- Rejected: server chỉ tin giỏ của nó.

### Chuyển hướng sau `POST` (303), mã đã xóa trong query string của `GET /`

- Pros: tải lại trang không hỏi gửi lại form. Địa chỉ mang được giỏ còn lại.
- Cons: SPEC giữ `GET /` trả giỏ mẫu đủ, và query string không đổi trang. Trang của `GET /` đang dựng một lần khi tạo server. Mỗi lần xóa thành hai request.
- Rejected: đổi hành vi của `GET /` mà SPEC giữ nguyên.

### Tên sản phẩm làm mã

- Pros: không thêm trường.
- Cons: tên có thể trùng, chứa mọi ký tự và đổi khi sửa câu chữ. Tên có dấu phải mã hóa trong body: "Bút bi" thành `B%C3%BAt+bi`, dài gấp đôi.
- Rejected: mã riêng ngắn, ổn định, và không phải mã hóa.

## Consequences

- `CartItem` có `id` bắt buộc. Mọi giỏ truyền vào `cartServer`, kể cả trong test và E2E, phải có mã hợp lệ. Bỏ kiểm mã khi tạo server thì mã trùng làm một nút "Xóa" xóa hai dòng.
- Khi dự án có kho lưu giỏ, mã dòng phải ổn định. Nếu một mã đổi, trang đang mở với mã cũ không xóa được dòng đó (mã lạ, bỏ qua), nhưng không bao giờ xóa nhầm dòng khác.
- Giới hạn body 1.024 byte chặn số dòng đã xóa mà form mã mang được. Với ô mã ở trường hợp xấu nhất, form còn chỗ cho 28 dòng có mã 6 ký tự, hay 10 dòng có mã 32 ký tự (SPEC, Non-functional requirements). Giỏ lớn hơn cần lưu giỏ (ngoài phạm vi) hoặc nâng giới hạn body (Ask first), và cần một ADR mới.
- `POST /` có một giao thức form công khai gồm `remove`, `removed`, `code` và `applied`, ghi trong README. Đổi tên một trường làm hỏng các trang đang mở lúc đó; nên thêm trường mới thay vì đổi tên.
- Một `POST /` có `remove` không đọc `code`, nên trang không hiện thông báo lỗi mã.
- Gửi lại cùng form cho cùng trang. Mở lại `/` bằng `GET` cho lại giỏ mẫu đủ. Lịch sử của trình duyệt giữ các trang cũ cùng giỏ còn lại của chúng; giỏ không có dữ liệu cá nhân.
- Khi dự án thêm kho lưu giỏ, đăng nhập hay thanh toán, cần một ADR mới thay ADR này: khi đó kho giữ giỏ, và mã dòng thành khóa của kho.
