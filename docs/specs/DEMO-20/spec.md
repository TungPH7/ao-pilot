# Spec: Xóa sản phẩm khỏi giỏ hàng

> **Epic:** DEMO-20 · **Jira:** https://phunghuutung12b4.atlassian.net/browse/DEMO-20 · **Status:** Draft

## Objective

Người mua xóa được một sản phẩm khỏi giỏ trên trang giỏ hàng. Trang hiện ngay giỏ còn lại cùng các con số mới: tạm tính, phí vận chuyển, giảm giá và tổng cộng.

Epic không có Figma. Epic đụng tới giao diện: mỗi dòng của bảng có thêm nút "Xóa". Vì vậy `ux` viết các màn hình trong `docs/specs/DEMO-20/design.md`, cạnh file này.

Thành công nghĩa là, trên giỏ hàng mẫu:

- người mua xóa được từng dòng, cho tới khi giỏ trống;
- mọi con số tính lại đúng theo giỏ còn lại, kể cả khoản giảm của mã đang áp;
- server chỉ xóa theo yêu cầu gửi từ chính trang, và chỉ tính tiền trên giỏ của server.

### Scope

Trong phạm vi (theo Epic):

- Một nút "Xóa" trên mỗi dòng của bảng giỏ hàng. Nút xóa cả dòng.
- Tính lại tạm tính, phí vận chuyển, giảm giá của mã đang áp và tổng cộng theo giỏ còn lại.
- Xóa hết thì trang hiện giỏ trống, như giỏ trống hiện nay.

Ngoài phạm vi:

- Theo Epic: lưu giỏ giữa các lần tải trang, hoàn tác, đổi số lượng, đăng nhập, thanh toán.
- Hỏi xác nhận trước khi xóa, và thông báo sau khi xóa (quyết định Q1 và Q2, mục Business rules).
- Thêm lại một dòng đã xóa. Mở lại `/` bằng `GET` thì trang hiện lại giỏ mẫu đủ hai dòng, vì giỏ không được lưu.

### Business rules

Giỏ hàng mẫu là `SAMPLE_CART` của `src/server.ts`:

| Sản phẩm | Đơn giá | Số lượng | Thành tiền |
|---|---|---|---|
| Bút bi | 5.000 ₫ | 3 | 15.000 ₫ |
| Sổ tay | 12.000 ₫ | 2 | 24.000 ₫ |

Tạm tính 39.000 ₫, phí vận chuyển 3.000 ₫, tổng cộng 42.000 ₫.

- "Xóa" xóa cả dòng, mọi số lượng của dòng đó. Epic không giảm số lượng từng cái.
- Tiền tính bằng số nguyên đồng, như `src/cart.ts`.
- Giỏ còn lại được tính như mọi giỏ, bằng các hàm hiện có, không đổi quy tắc nào:
  - tạm tính bằng `total()`;
  - phí vận chuyển bằng `shipping()`: 3.000 ₫ khi tạm tính dưới 50.000 ₫, miễn phí từ 50.000 ₫;
  - giảm giá bằng `discount()` trên tạm tính mới, không lớn hơn tạm tính;
  - tổng cộng = tạm tính − số tiền giảm + phí vận chuyển.
- Xóa một dòng không đổi mã đang áp. Mã đó được tính lại trên giỏ còn lại (AC5, AC6).
- Áp mã sau khi đã xóa không làm hiện lại dòng đã xóa (AC7, AC8).
- Xóa hết thì trang hiện "Giỏ hàng trống." như giỏ trống hiện nay: không bảng, không ô mã, không con số nào. Mã đang áp không còn hiện, như quy tắc "giỏ hàng trống không có ô nhập mã" của DEMO-11.
- Bấm "Xóa" không gửi ô mã giảm giá:
  - chữ đã gõ vào ô mã mà chưa bấm "Áp dụng" bị bỏ;
  - thông báo lỗi mã của lần trước, nếu có, biến mất;
  - mã đang áp vẫn giữ.
- Nhấn Enter trong ô mã luôn là "Áp dụng", không bao giờ xóa một dòng (AC9).
- Không hỏi xác nhận trước khi xóa. Quyết định Q1, ngày 2026-11-01:
  - trang không có script, nên hỏi xác nhận cần thêm một trang hoặc một bước `POST` nữa;
  - giỏ không được lưu, nên mở lại `/` là có lại giỏ mẫu.
- Không hiện thông báo sau khi xóa: dòng biến mất và các con số đổi là đủ cho người nhìn thấy. Quyết định Q2, ngày 2026-11-01.
  - Nếu `ux` thấy người dùng trình đọc màn hình cần một câu báo, `ux` đề xuất câu chữ trong `design.md`, và bạn duyệt câu đó ở gate ①.

Câu chữ trên trang. `ux` viết `design.md` theo đúng câu chữ này:

- Nhãn của nút: "Xóa".
- Đề xuất: tên truy cập của nút nêu tên sản phẩm, như "Xóa Bút bi", để trình đọc màn hình phân biệt nút của từng dòng. Tên bắt đầu bằng nhãn nhìn thấy "Xóa". `ux` chốt cách làm trong `design.md`.
- Các câu chữ hiện có của DEMO-10 và DEMO-11 không đổi.

### User stories

Mọi AC dùng giỏ hàng mẫu ở trên, trừ AC4. Quyết định Q3, ngày 2026-11-01:

- Giỏ mẫu luôn dưới ngưỡng 50.000 ₫, nên xóa trên giỏ mẫu không bao giờ đổi phí vận chuyển.
- Vì vậy AC4 dùng một giỏ riêng có tạm tính 55.000 ₫, mà test E2E tự khởi động bằng `cartServer(items)` (mục Testing Strategy).
- `SAMPLE_CART` không đổi, vì đổi nó làm hỏng E2E của DEMO-10 và DEMO-11.

Các số tiền dưới đây, tôi đã tính bằng `renderCart` của `src/page.ts` trên Node 24.17.0, ngày 2026-11-01. Số tiền giảm có dấu trừ, như "-2.400 ₫" của DEMO-11.

**User story 1.** Là người mua, tôi muốn xóa một sản phẩm khỏi giỏ hàng, để giỏ chỉ còn những gì tôi định mua và tôi thấy ngay số tiền mới.

- AC1: Given giỏ hàng mẫu chưa áp mã, When bấm "Xóa" ở dòng Bút bi, Then bảng chỉ còn một dòng, Sổ tay (12.000 ₫, 2, 24.000 ₫), không còn dòng Bút bi nào; tạm tính là 24.000 ₫, phí vận chuyển là 3.000 ₫, tổng cộng là 27.000 ₫; và trang không có thông báo nào về mã giảm giá.
- AC2: Given giỏ hàng mẫu chưa áp mã, When bấm "Xóa" ở dòng Sổ tay, Then bảng chỉ còn dòng Bút bi (5.000 ₫, 3, 15.000 ₫), tạm tính là 15.000 ₫, phí vận chuyển là 3.000 ₫, và tổng cộng là 18.000 ₫.
- AC3: Given đã xóa Bút bi khỏi giỏ hàng mẫu, When bấm "Xóa" ở dòng Sổ tay, Then trang hiện "Giỏ hàng trống.", và không có bảng, ô mã giảm giá, tạm tính, phí vận chuyển hay tổng cộng.
- AC4: Given giỏ gồm Bàn phím (40.000 ₫, 1) và Chuột (15.000 ₫, 1), tạm tính 55.000 ₫, phí vận chuyển "Miễn phí", tổng cộng 55.000 ₫, When bấm "Xóa" ở dòng Chuột, Then tạm tính là 40.000 ₫, phí vận chuyển là 3.000 ₫, và tổng cộng là 43.000 ₫.

**User story 2.** Là người mua, tôi muốn mã giảm giá đang áp được giữ và tính lại khi tôi xóa sản phẩm, và giỏ đã xóa được giữ khi tôi áp mã, để không phải làm lại và luôn thấy đúng số tiền phải trả.

- AC5: Given đã áp `GIAM10` trên giỏ hàng mẫu (tổng cộng 38.100 ₫), When bấm "Xóa" ở dòng Bút bi, Then dòng giảm giá của `GIAM10` là "-2.400 ₫", tạm tính là 24.000 ₫, phí vận chuyển là 3.000 ₫, và tổng cộng là 24.600 ₫.
- AC6: Given đã áp `GIAM20K` trên giỏ hàng mẫu (tổng cộng 22.000 ₫), When bấm "Xóa" ở dòng Sổ tay, Then dòng giảm giá của `GIAM20K` là "-15.000 ₫", bằng tạm tính 15.000 ₫, phí vận chuyển là 3.000 ₫, và tổng cộng là 3.000 ₫.
- AC7: Given đã xóa Bút bi khỏi giỏ hàng mẫu, When nhập `GIAM10` và bấm "Áp dụng", Then bảng vẫn chỉ còn dòng Sổ tay, dòng giảm giá của `GIAM10` là "-2.400 ₫", và tổng cộng là 24.600 ₫.
- AC8: Given đã xóa Bút bi khỏi giỏ hàng mẫu, When nhập `SAIMA` và bấm "Áp dụng", Then thấy "Mã giảm giá không hợp lệ.", bảng vẫn chỉ còn dòng Sổ tay, và tổng cộng vẫn là 27.000 ₫.
- AC9: Given giỏ hàng mẫu chưa áp mã, When nhập `GIAM10` vào ô mã và nhấn Enter, Then mã được áp, tổng cộng là 38.100 ₫, và bảng vẫn đủ hai dòng.

**User story 3.** Là chủ shop, tôi muốn server chỉ xóa dòng theo yêu cầu gửi từ chính trang giỏ hàng, và chỉ tính tiền trên giỏ của server, để trang web khác không xóa được giỏ của người mua và form không đổi được giá hay số lượng.

- AC10: Given một request `POST /` yêu cầu xóa dòng Bút bi, có `Origin` khác địa chỉ của server (như `http://evil.example`) hoặc không có `Origin`, When server nhận request, Then server trả 403 và không trả trang giỏ hàng.
- AC11: Given một request `POST /` từ đúng `Origin`, yêu cầu xóa một dòng không có trong giỏ (như mã dòng `khong-co`) và kèm các trường tên, đơn giá, số lượng hay tổng cộng tự đặt, When server nhận request, Then server trả 200 với giỏ hàng mẫu đủ hai dòng, đúng tên, đơn giá và số lượng như cũ, tạm tính 39.000 ₫ và tổng cộng 42.000 ₫.

### Technical requirements

Các yêu cầu sau không phải user story. Chỗ nào ghi "đề xuất", `sa` chốt trong plan.

- Giữ cách làm hiện có: HTML dựng ở server bằng `node:http`, không framework, không script phía client, CSP giữ nguyên.
- Server vẫn không lưu trạng thái. Giỏ còn lại đi theo form, như mã đang áp đi trong trường ẩn `applied` hôm nay:
  - Mỗi dòng của giỏ server có một mã dòng cố định, không đổi khi dòng khác bị xóa. Quyết định Q5, ngày 2026-11-01:
    - `CartItem` có trường `id` bắt buộc, như `but-bi` và `so-tay` của `SAMPLE_CART`. Thêm `id` không đổi dòng, giá hay số lượng của `SAMPLE_CART`.
    - Mã dòng không phải vị trí của dòng trong giỏ. Nếu thứ tự của giỏ server đổi, mã cũ của một trang đang mở chỉ là mã lạ và bị bỏ qua, không xóa nhầm dòng.
    - Dữ liệu của các test hiện có thêm `id` (mục Tests that change).
  - Mọi form của trang mang danh sách các dòng đã xóa và mã đang áp. Đề xuất: trường ẩn `removed`, lặp lại một lần cho mỗi dòng đã xóa, và nút "Xóa" gửi `remove=<mã dòng>`.
  - Form chỉ mang mã dòng, không mang tên, đơn giá, số lượng hay số tiền. Server lấy mọi con số từ giỏ của server.
  - Giỏ còn lại là giỏ của server, bỏ các dòng có trong danh sách đã xóa và dòng cần xóa. Mã dòng không có trong giỏ, mã trùng hay rỗng bị bỏ qua, không có thông báo. Trang trả về chỉ ghi lại các mã có trong giỏ.
- Vì form mang cả giỏ còn lại, gửi lại cùng một form cho cùng một kết quả. Tải lại trang sau khi xóa, khi trình duyệt hỏi gửi lại form, không xóa thêm dòng nào.
- Một `POST /` có yêu cầu xóa không đọc trường `code`: trang không hiện thông báo lỗi mã, và mã trong `applied` được kiểm lại theo danh sách mã như hôm nay. Một `POST /` không có yêu cầu xóa là áp mã như hôm nay, trên giỏ còn lại.
- Mỗi nút "Xóa" là nút submit của một form `POST /` riêng. Nút không nằm trong form mã giảm giá và không dùng thuộc tính `form` để gắn vào form đó.
  - Lý do: Enter trong một ô nhập gửi form qua nút submit đầu tiên của form đó.
  - Tôi đã chạy thử trên Chrome cài trên máy, qua Playwright 1.64.1, ngày 2026-11-01, với prototype ở `.ai/ba/demo-20/probe/`:
    - Nút "Xóa" đứng trước "Áp dụng" và gắn vào form mã bằng `form`: Enter trong ô mã gửi `remove=but-bi&code=GIAM10`, tức xóa một dòng.
    - Mỗi nút "Xóa" có form riêng: Enter gửi `code=GIAM10`.
- `POST /` không có trường nào của Epic này cho đúng trang như hôm nay. Các AC của DEMO-11 và các test hiện có của `src/server.test.ts` cho `POST /` không đổi.
- `GET /` và `HEAD /` vẫn trả trang dựng một lần với giỏ đủ, nay có nút "Xóa" trên mỗi dòng.
- Thứ tự kiểm của server không đổi: `Host`, path, method, `Origin`, cỡ body. Yêu cầu xóa đi qua bước kiểm `Origin` như mọi `POST /` (AC10).
- Body của `POST /` giữ giới hạn 1.024 byte. Trên giỏ mẫu, body lớn nhất mà trang gửi là 44 byte cho form của nút "Xóa", và 612 byte cho form mã (mục Non-functional requirements).
- Mã dòng, khi ghi vào HTML (giá trị của nút, trường ẩn), đi qua `escapeHtml` của `src/page.ts`. Thuộc tính luôn có dấu nháy.
- Không có dữ liệu mới về người dùng. Mã dòng nằm trong code. Epic không thêm log theo request.

### Tests that change

Các test hiện có sau đổi theo Epic. Ý nghĩa của từng test giữ nguyên; chỉ cách kiểm đổi theo trang mới.

Nút "Xóa" nằm trong một ô mới của mỗi dòng. Hai test kiểm đúng bốn ô của mỗi dòng nên đổi theo. Bốn ô đầu vẫn là tên, đơn giá, số lượng và thành tiền:

- `e2e/cart.spec.ts`, AC1 của DEMO-10.
- `src/page.test.ts`, test "each line shows its name, unit price, quantity and line total".

Ba test nữa của `src/page.test.ts` đổi theo `design.md`. Quyết định Q4, ngày 2026-11-01:

| Test | Vì sao đổi | Ý nghĩa giữ nguyên |
|---|---|---|
| "a cart has a coupon form posting to /, with the labelled field [3] and the button [4], between the table and the totals" | Test kiểm `<form` đầu tiên đứng sau `</table>`. Nay form đầu tiên là form của nút "Xóa", trong bảng | Form mã đứng giữa bảng và các con số |
| "a coupon in force goes back with the form in the hidden field applied" | Test kiểm trang có đúng một `name="applied"`. Nay mỗi form có một, tức ba trên giỏ mẫu | Mã đang áp đi theo mọi form, mỗi form đúng một lần |
| "the style wraps the button under the field when the row is too narrow, without a media query" | Test kiểm `STYLE` không có `@media`. Design thêm đúng một media query dưới 30 rem | Hàng ô mã và nút "Áp dụng" vẫn xuống dòng mà không cần media query; `STYLE` có đúng một media query, và nó không đụng luật của form mã |

Dữ liệu của các test hiện có thêm `id`, vì `CartItem` có `id` bắt buộc. Quyết định Q5, ngày 2026-11-01. Chỉ đổi dữ liệu, không đổi assertion hay tên test:

- 7 dòng dữ liệu, trong 6 giỏ, của `src/page.test.ts`;
- 1 dòng của `src/server.test.ts`, trong test "a cart the page cannot show stops the server from being made, not a request". Giỏ của test này vẫn bị từ chối vì giá âm.

Mọi test khác của `src/page.test.ts` và `src/server.test.ts`, và mọi E2E khác của DEMO-10 và DEMO-11, phải pass mà không đổi. Trên prototype của `sa` ở `.ai/sa/demo-20/probe/`, ngày 2026-11-01, 26 test còn lại của `src/page.test.ts` và 26 test của `src/server.test.ts` pass như vậy.

### Non-functional requirements

`sa` thêm mục này ngày 2026-11-01. Tôi chạy thử mọi hành vi của Node nêu dưới đây trên Node 24.17.0, cùng ngày. Số byte Chrome gửi, tôi đo trên Chrome cài trên máy, qua Playwright 1.64.1, với prototype ở `.ai/sa/demo-20/probe/` (không commit).

Các yêu cầu của DEMO-11 giữ nguyên: giới hạn header, thời hạn request, đọc body bằng sự kiện `data` và `end`, header của response. Mục này chỉ ghi phần Epic thêm.

#### Performance

- Mỗi request vẫn xử lý hoàn toàn trong bộ nhớ: không đọc file, không gọi mạng, không cơ sở dữ liệu. Chọn các dòng còn lại là lọc giỏ của server theo mã dòng gửi lên.
- `GET /` và `HEAD /` vẫn trả trang dựng một lần khi tạo server. `POST /` dựng trang ở mỗi request, như hôm nay.
- Giới hạn body 1.024 byte giữ nguyên, và mọi form của trang phải vừa giới hạn đó. Trên giỏ mẫu, với mã dòng `but-bi`, `so-tay` (quyết định Q5) và tên trường `ba` đề xuất, body lớn nhất Chrome gửi là:
  - form của nút "Xóa": 44 byte, `removed=but-bi&applied=GIAM20K&remove=so-tay`;
  - form mã: 612 byte, khi ô mã có đủ 64 ký tự 3 byte UTF-8 như "ạ" (mỗi ký tự thành 9 byte `%E1%BA%A1`), cùng một dòng đã xóa và `GIAM20K`.
- Vì giỏ còn lại đi theo form, giới hạn body chặn số dòng đã xóa mà form mã mang được:
  - Mỗi dòng đã xóa thêm `&removed=<mã dòng>`, tức 9 byte cộng độ dài mã.
  - Với ô mã ở trường hợp xấu nhất trên, form còn chỗ cho 28 dòng đã xóa có mã 6 ký tự, hay 10 dòng có mã 32 ký tự.
  - Giỏ của Epic có hai dòng, nên Epic chấp nhận giới hạn này. Giỏ lớn hơn cần lưu giỏ (ngoài phạm vi) hoặc nâng giới hạn body (Ask first).
- Body 1.024 byte chứa nhiều nhất 128 giá trị `removed`. Server tra từng giá trị trong một `Set` các mã dòng của giỏ, nên thời gian tỷ lệ với số dòng cộng số giá trị.
- Không đặt mục tiêu độ trễ bằng số, như DEMO-11. Mỗi request của `src/server.test.ts` vẫn có timeout 5.000 ms.

#### Security

Bổ sung cho mục Technical requirements và mục Boundaries:

- Yêu cầu xóa không có đường riêng trong server. Server đọc `remove` và `removed` ở cùng chỗ đọc `code` hôm nay: sau các bước kiểm `Host`, path, method, `Origin` và cỡ body. Vì vậy form của trang khác nhận 403 trước khi body được đọc (AC10).
- `frame-ancestors 'none'` và `form-action 'self'` của CSP giữ nguyên. Trang khác không nhúng được trang giỏ hàng để lừa người mua bấm "Xóa", và form của trang chỉ gửi về server này.
- Từ form, server chỉ đọc mã: `remove`, mọi giá trị của `removed`, và `applied` như hôm nay. Tên, đơn giá, số lượng, số tiền và mọi trường khác bị bỏ qua (AC11). Server chỉ đọc giá trị đầu của `remove`, như `code` và `applied` hôm nay.
- Mã dòng gửi lên được so với mã dòng của giỏ server nguyên chuỗi, như `Host` và `Origin`: không trim, không đổi hoa thường. Vì vậy `BUT-BI` là mã lạ và bị bỏ qua. Trên Node 24.17.0, `removed=%FF` cho U+FFFD, cũng là mã lạ.
- Tra mã dòng bằng `Set` hay `Map` dựng từ giỏ server, không bằng khóa của một object thường.
  - Trên Node 24.17.0, `({})['__proto__']`, `({})['constructor']`, `({})['toString']` và `({})['hasOwnProperty']` đều có giá trị, nên `remove=constructor` sẽ trùng một "dòng" không có thật.
  - `Set.has` trả `false` cho cả bốn.
- Trang trả về ghi mã dòng lấy từ giỏ server, không ghi chuỗi gửi lên. Vì vậy các trường mới không đưa chuỗi nào của request vào HTML. Mã dòng vẫn qua `escapeHtml`, và thuộc tính vẫn có dấu nháy (Technical requirements).
- Mã dòng của giỏ server không rỗng và không trùng trong một giỏ:
  - mã trùng làm một nút "Xóa" xóa hai dòng;
  - mã rỗng không phân biệt được với giá trị rỗng bị bỏ qua.
  - Giỏ vi phạm làm `cartServer(items)` ném `RangeError` khi tạo server, không ở một request, như giá hay số lượng sai hôm nay.
  - Đề xuất, plan chốt: mã dòng chỉ gồm `a`–`z`, `0`–`9` và `-`, dài 1 đến 32 ký tự. Như vậy mã không phải mã hóa trong body, và giới hạn ở mục Performance luôn đúng.
- Mã dòng lạ, trùng hay rỗng gửi lên là kết quả bình thường: không ném lỗi, không trả lỗi, response không có stack trace.
- Không giới hạn tần suất request, như DEMO-11. Server không lưu trạng thái, nên một yêu cầu xóa chỉ đổi trang trả về cho chính request đó. [Inference] Nếu không có bước kiểm `Origin`, tác hại lớn nhất của một yêu cầu xóa giả là trang giỏ thiếu dòng trong trình duyệt của người mua; mở lại `/` là có lại giỏ.

#### Data and retention

- Dữ liệu mới Epic xử lý: mã dòng cần xóa và danh sách mã dòng đã xóa, trong body của `POST /` và trong các trường của trang.
  - Mã dòng là hằng số trong code (`SAMPLE_CART`), không phải dữ liệu người dùng.
  - Epic không thêm dữ liệu cá nhân.
- Lưu ở server: không có. Không cookie, không session, không file. Giỏ còn lại chỉ nằm trong bộ nhớ trong thời gian của một request, và trong HTML trả về. Thời gian lưu ở server: 0.
- Ở trình duyệt, trang trả về của `POST /` nằm trong lịch sử như mọi trang, kèm giỏ còn lại trong các trường. Epic không điều khiển lịch sử của trình duyệt. Mở lại `/` bằng `GET` cho lại giỏ mẫu đủ (Scope).
- Log: Epic không thêm log theo request. Không ghi body, mã dòng hay giá trị header vào log (Boundaries).
- Dữ liệu test:
  - giỏ mẫu và giỏ của AC4 (Bàn phím, Chuột);
  - các mã dòng lạ như `khong-co`, `BUT-BI`, `constructor`.
  - Trace của Playwright nằm ở `test-results/`, đã có trong `.gitignore`.

#### Tests of these requirements

Cộng thêm vào mục Testing Strategy, ở `src/server.test.ts`:

- Body lớn nhất mà trang gửi trên giỏ mẫu (612 byte như trên, tính lại theo tên trường plan chốt) được đọc, và server trả 200.
- `remove` là `constructor`, `__proto__` hay `BUT-BI`: trang là giỏ mẫu đủ hai dòng.
- `removed` là `<script>` hay một mã lạ khác: trang trả về không chứa chuỗi đó.
- `cartServer` với mã dòng trùng hay rỗng ném `RangeError` khi tạo server.
- Yêu cầu xóa có `Origin` sai nhận 403, kể cả khi body quá 1.024 byte.

## Tech Stack

Epic không thêm dependency, không đổi phiên bản nào. Phiên bản hiện có nằm trong `package.json` (Node `>=24.2`, TypeScript 6.0.3, `@playwright/test` 1.64.1); các lệnh nằm trong README.

Epic dùng lần đầu trong repo hai thứ có sẵn, không phải dependency mới:

| Thứ dùng | Dùng cho | Đã chạy thử |
|---|---|---|
| `URLSearchParams.prototype.getAll` | Đọc mọi giá trị của trường lặp lại `removed` | Node 24.17.0, ngày 2026-11-01 (`sa`): trả mọi giá trị theo thứ tự, kể cả giá trị rỗng và trùng |
| Một test Playwright import `src/server.ts` và tự khởi động `cartServer(items)` trên port 0 của 127.0.0.1 | E2E của AC4, với giỏ 55.000 ₫ | Playwright 1.64.1 và Chrome, ngày 2026-11-01 (`ba`, `.ai/ba/demo-20/probe/`) |

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
src/cart.ts           → mã dòng, và một hàm thuần chọn các dòng còn lại (hoặc một module mới, sa chốt)
src/page.ts           → nút "Xóa" trên mỗi dòng, trường ẩn của các dòng đã xóa trong mọi form
src/server.ts         → mã dòng của SAMPLE_CART, đọc yêu cầu xóa của POST /
src/*.test.ts         → unit và integration test, cạnh file nguồn như hiện nay
e2e/remove.spec.ts    → E2E cho AC1–AC11 (mới)
e2e/cart.spec.ts      → AC1 của DEMO-10 đổi theo ô mới (mục Tests that change)
docs/specs/DEMO-20/   → spec.md (file này), design.md của ux, plan.md của sa
README.md             → thêm yêu cầu xóa vào phần POST /
```

## Code Style

Repo chưa có `CLAUDE.md`, nên Epic theo code hiện có, như ở DEMO-11. Dữ liệu người dùng gửi lên mà sai là kết quả bình thường, không phải lỗi. Ví dụ từ `src/coupon.ts`:

```ts
// The coupon whose code equals the text once trimmed and upper-cased, or undefined. Never throws.
export function findCoupon(text: string): Coupon | undefined {
  const code = text.trim().toUpperCase();
  return COUPONS.find((coupon) => coupon.code === code);
}
```

- Mã dòng lạ trong form được bỏ qua như mã giảm giá lạ: hàm trả về giỏ, không ném lỗi.
- Code, comment và tên test viết bằng tiếng Anh; chữ hiện trên trang viết bằng tiếng Việt.
- Import ghi đuôi `.ts`. `tsconfig.json` bật `erasableSyntaxOnly`: không `enum`, không parameter property.
- Chuỗi đưa vào HTML luôn đi qua `escapeHtml`.

## Testing Strategy

Mọi Story và Sub-task viết theo TDD: test đỏ trước, code sau.

**Unit test** (`node:test`, cạnh file nguồn):

- Hàm chọn các dòng còn lại:
  - xóa một dòng, xóa hết;
  - mã dòng lạ, trùng, rỗng bị bỏ qua;
  - thứ tự các dòng còn lại giữ như giỏ.
- `src/page.ts`:
  - mỗi dòng có nút "Xóa" với tên truy cập như `design.md`;
  - giỏ đủ, không mã: không có trường ẩn nào, như test hiện có;
  - các dòng đã xóa có trong trường ẩn của mọi form;
  - mã đang áp có trong form xóa;
  - mã dòng được escape;
  - không có nút "Xóa" nào trong form mã giảm giá hoặc gắn vào form đó.

**Integration test** (`src/server.test.ts`, server thật trên port tự do của 127.0.0.1, mọi request có timeout):

- `POST /` xóa một dòng, xóa dòng thứ hai khi dòng thứ nhất đã xóa, xóa hết.
- Xóa khi có mã đang áp: khoản giảm tính lại, `GIAM20K` không vượt tạm tính.
- Ngưỡng miễn phí vận chuyển, với `cartServer(items)` và giỏ 55.000 ₫.
- Yêu cầu xóa không hiện thông báo lỗi mã, kể cả khi body có `code`.
- Mã dòng lạ, trùng hay rỗng, và các trường tên, giá, số lượng, tổng cộng tự đặt: trang như giỏ mẫu.
- Gửi lại cùng một form cho cùng một trang.
- Yêu cầu xóa từ `Origin` khác hoặc không có `Origin` → 403.

**E2E test** (`e2e/remove.spec.ts`, Playwright với Chrome): mỗi AC từ AC1 đến AC11 có một test, tên bắt đầu bằng mã AC.

- Mọi test nằm trong `test.describe('DEMO-20', …)`, để báo cáo QA phân biệt chúng với các test `AC1 …` của DEMO-10 và DEMO-11.
- AC1–AC9 đi qua trang: bấm nút "Xóa" của dòng, tìm theo vai trò và tên, rồi đọc các phần tử theo `data-testid`.
- AC4 cần giỏ 55.000 ₫ nên test tự khởi động `cartServer(items)` trên port 0 của 127.0.0.1 rồi mở Chrome tới đó. Tôi đã chạy thử cách này trong `.ai/ba/demo-20/probe/` ngày 2026-11-01 (quyết định Q3).
- AC10 và AC11 gửi request HTTP thô bằng `node:http`, như AC9–AC11 của DEMO-11 trong `e2e/coupon.spec.ts`.
- Theo README, E2E chưa chạy trong CI; `qa` chạy chúng trên máy.

**Coverage:** ít nhất 80% số dòng thay đổi được phủ (`changed_lines_min: 80` trong `.ai-orchestrator/quality/gates.yaml`).

## Boundaries

- **Always:**
  - Tính mọi con số từ giỏ của server, ở mỗi request.
  - Tính tiền bằng số nguyên đồng, bằng `total()`, `shipping()` và `discount()` hiện có.
  - Escape mọi chuỗi trước khi đưa vào HTML, và luôn đặt thuộc tính trong dấu nháy.
  - Giữ thứ tự kiểm `Host`, path, method, `Origin`, cỡ body của server.
  - Viết test trước code. Tên E2E bắt đầu bằng mã AC.
- **Ask first:**
  - Đổi `SAMPLE_CART` (dòng, giá, số lượng): E2E của DEMO-10, DEMO-11 và Epic này dựa vào nó.
  - Thêm dependency.
  - Đổi CSP, giới hạn body, hoặc địa chỉ hay port mà server nghe.
  - Thêm cookie, session hay bất kỳ cách lưu trạng thái nào.
  - Đổi quy tắc phí vận chuyển, danh sách mã hay mức giảm.
  - Đổi câu chữ trên trang đã chốt ở mục Business rules, hoặc thêm câu chữ mới.
  - Đổi một test hiện có ngoài các test và dữ liệu của mục Tests that change.
- **Never:**
  - Thêm JavaScript phía client.
  - Đặt nút "Xóa" trong form mã giảm giá, hay gắn nút vào form đó bằng thuộc tính `form`.
  - Tin tên, đơn giá, số lượng hay số tiền gửi lên từ form.
  - Đặt `Referrer-Policy: no-referrer`: Chrome sẽ gửi `Origin: null` và server trả 403 cho form của chính trang.
  - Ghi body của request vào log.
  - Sửa `.ai-orchestrator/**`, `.claude/**` hay `.githooks/**`.

## Success Criteria

Các điều kiện sau cộng thêm vào Epic DoD của `.ai-orchestrator/docs/sdlc.md`.

- Các Story Jira của Epic đạt Story DoD: E2E của AC1–AC11 pass trên Chrome.
- Mọi E2E của DEMO-10 (`e2e/cart.spec.ts`, AC1 đổi theo ô mới) và DEMO-11 (`e2e/coupon.spec.ts`) vẫn pass.
- Review security không còn finding Critical hay High.
- README mô tả yêu cầu xóa của `POST /`.
- `npm run lint`, `npm run typecheck` và `npm test` xanh. Ít nhất 80% số dòng thay đổi được phủ.

## Open Questions

Không còn câu hỏi mở.

- Các câu Q1–Q3 của `ba` được trả lời ngày 2026-11-01: bạn chọn đề xuất của `ba` ở cả ba câu. Các câu trả lời đã thành quyết định trong các mục Scope, Business rules, User stories và Testing Strategy.
- Các câu Q4 và Q5 của `sa` được trả lời ngày 2026-11-01 ("theo đề xuất"): bạn chọn đề xuất của `sa` ở cả hai câu. Các câu trả lời đã thành quyết định trong các mục Technical requirements (mã dòng `id`), Tests that change và Boundaries.
