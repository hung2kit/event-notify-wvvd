# Event Notify

Công cụ nội bộ của World Vision Việt Nam để đặt lịch gửi email thông báo cho cán bộ, nhân viên. Giờ trong ứng dụng luôn là giờ Việt Nam (Asia/Ho_Chi_Minh).

Ứng dụng gồm 4 phần, đều chạy bằng Docker:

| Phần     | Việc nó làm                             |
| -------- | --------------------------------------- |
| web      | Giao diện, mở trên trình duyệt          |
| api      | Nhận thao tác từ giao diện, lưu dữ liệu |
| worker   | Đến giờ thì gửi email. Phải luôn chạy   |
| postgres | Cơ sở dữ liệu                           |

## Đưa lên server

### 1. Chuẩn bị

- Server cài sẵn **Docker** và **Docker Compose** (kiểm tra bằng `docker compose version`).
- Chép mã nguồn lên server, ví dụ `git clone <địa-chỉ-repo> event-notify`, rồi `cd event-notify`.

### 2. Tạo file cấu hình `.env`

```bash
cp .env.example .env
chmod 600 .env
```

Mở `.env` và điền các dòng sau (những dòng khác giữ nguyên):

```bash
POSTGRES_PASSWORD=<tự đặt một mật khẩu mạnh>

AUTH_MODE=dev
DEV_USER_EMAIL=<email quản trị, ví dụ son_le_quoc_hung@wvi.org>

MAIL_FROM_ADDRESS=<địa chỉ gửi, phải trùng SMTP_USER>
MAIL_FROM_NAME=Event Notify
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_USER=<tài khoản gửi mail>
SMTP_PASS=<mật khẩu tài khoản gửi mail>

WEB_ORIGIN=http://<ip-hoặc-tên-server>:8080
SEED_ON_BOOT=false
```

> `.env` chứa mật khẩu. Không gửi file này qua chat và không đưa lên git.
>
> `MAIL_FROM_ADDRESS` khác `SMTP_USER` thì Outlook sẽ từ chối thư, trừ khi IT đã cấp quyền "Send As".

### 3. Khởi động

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Lần đầu mất vài phút để build. Bảng dữ liệu được tạo tự động.

### 4. Nạp dữ liệu ban đầu (chỉ làm một lần)

Tạo tài khoản quản trị và các nhóm nhận:

```bash
docker compose -f docker-compose.prod.yml exec api pnpm --filter @phat-tin/db seed
```

Không chạy lại lệnh này về sau, vì nó đặt lại thông tin các nhóm nhận về mặc định.

### 5. Kiểm tra

1. Mở `http://<ip-hoặc-tên-server>:8080`.
2. Chấm ở chân trang màu xanh, ghi "Hệ thống gửi mail hoạt động bình thường".
3. Tạo một thông báo, bấm **Gửi thử**, kiểm tra hộp thư.

## Vận hành hằng ngày

Mọi lệnh chạy trong thư mục mã nguồn. Để gõ ngắn hơn, đặt trước:

```bash
alias en='docker compose -f docker-compose.prod.yml'
```

| Muốn làm gì             | Lệnh                           |
| ----------------------- | ------------------------------ |
| Xem các phần đang chạy  | `en ps`                        |
| Xem log gửi mail        | `en logs -f worker`            |
| Xem log giao diện / api | `en logs -f api`               |
| Khởi động lại           | `en restart`                   |
| Dừng                    | `en down`                      |
| Cập nhật bản mới        | `git pull && en up -d --build` |
| Sau khi sửa `.env`      | `en up -d`                     |

Ứng dụng tự chạy lại khi server khởi động lại. Dữ liệu được giữ khi dừng hoặc cập nhật. Chỉ lệnh `en down -v` mới xoá dữ liệu, đừng dùng lệnh này.

### Sao lưu và khôi phục

```bash
# Sao lưu
en exec -T postgres pg_dump -U eventnotify eventnotify > backup-$(date +%F).sql

# Khôi phục
en exec -T postgres psql -U eventnotify eventnotify < backup-2026-10-29.sql
```

## Khi gặp lỗi

- **Lịch sử báo lỗi gửi:** bấm vào nhãn lỗi để xem chi tiết từ máy chủ mail và gợi ý cách xử lý. Sửa xong thì bấm **Gửi lại**.
- **Chân trang ghi "Hệ thống gửi mail chưa phản hồi":** worker đang dừng. Chạy `en ps` và `en logs worker` để xem lý do.
- **Không mở được trang:** kiểm tra `en ps` và firewall của server có mở cổng 8080 cho mạng nội bộ chưa.

## Lưu ý bảo mật

Hiện chưa có đăng nhập (`AUTH_MODE=dev`): ai mở được trang cũng có quyền quản trị. Chỉ mở cổng 8080 trong mạng nội bộ hoặc VPN, không mở ra internet. Cơ sở dữ liệu không mở cổng ra ngoài.

## Chạy trên máy cá nhân để phát triển

Cần Node 22, pnpm và Docker.

```bash
pnpm install
docker compose up -d postgres mailpit
cp .env.example .env
pnpm db:migrate && pnpm db:seed
pnpm dev
```

Mở http://localhost:5173. Email gửi thử nằm trong Mailpit tại http://localhost:8025, không đi ra ngoài.
