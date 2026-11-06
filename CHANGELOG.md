# Changelog

## [0.2.0] - 2026-11-06

### Added

- Trang giỏ hàng tối thiểu, render trên server: `GET /` trả trang giỏ với các dòng sản phẩm và tổng tiền (DEMO-10).
- Phí vận chuyển của giỏ: 3.000 ₫ khi tạm tính dưới 50.000 ₫, miễn phí từ 50.000 ₫, 0 ₫ với giỏ rỗng (DEMO-6).
- Áp mã giảm giá trên trang giỏ hàng: `GIAM10` giảm 10% tạm tính (làm tròn xuống), `GIAM20K` giảm 20.000 ₫ (không quá tạm tính); mã trống hoặc sai hiện thông báo và giữ mã đang áp (DEMO-12).
- Xóa một sản phẩm khỏi giỏ bằng nút "Xóa" của từng dòng; tổng tiền, phí vận chuyển và mã đang áp được tính lại (DEMO-21).
- Đóng gói ứng dụng bằng `Dockerfile` (Node 24, user `node`) cho deployer của kit, biến `AO_PUBLIC_URL` cho Host và Origin công khai sau Caddy (ADR-0003), và E2E chạy được trên một môi trường qua `E2E_BASE_URL` (DEMO-26).

### Changed

- Server kiểm từng request theo thứ tự: Host (400), đường dẫn (404), phương thức (405), Origin của `POST` (403), body quá 1024 byte (413) (DEMO-12, DEMO-21, DEMO-26).
- Triển khai do deployer của kit trên VPS thực hiện; bỏ workflow giả lập `deploy.yml` và `audit.yml` (DEMO-26). Thay đổi `timeout-minutes` của job deploy (DEMO-16) vì thế không còn trong bản này.
- Yêu cầu Node `>=24.2` (trước đây `>=24`).
- Cập nhật bản chép kit ai-orchestrator: quality gates, merge-gate, audit và gh-guard (DEMO-5), danh sách agent (DEMO-9), lệnh dev-workflow; `merge-gate` đọc thêm Jira và `jira-sync` chạy cả khi PR đóng (DEMO-19).

### Fixed

Không có.

### Known Issues

Không có.
