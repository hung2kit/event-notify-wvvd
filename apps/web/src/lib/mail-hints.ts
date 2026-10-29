import type { MailErrorDetail } from '../types';

/** Turns common SMTP replies (Microsoft 365 / Outlook first) into a next step for the reader. */
export function mailHint(
  detail: MailErrorDetail | undefined,
  summary?: string | null,
): string | null {
  const response = `${detail?.response ?? ''} ${detail?.message ?? ''}`.toLowerCase();
  const code = detail?.code ?? '';
  const smtp = detail?.responseCode;

  if (code === 'EAUTH' || smtp === 535 || response.includes('authentication unsuccessful')) {
    return 'Máy chủ không chấp nhận tài khoản SMTP. Kiểm tra SMTP_USER, SMTP_PASS trong .env và chắc chắn hộp thư đã bật "Authenticated SMTP" trong Microsoft 365.';
  }
  if (response.includes('5.7.57') || response.includes('client not authenticated')) {
    return 'Máy chủ yêu cầu đăng nhập trước khi gửi. Kiểm tra SMTP_USER, SMTP_PASS và SMTP_REQUIRE_TLS.';
  }
  if (response.includes('sendasdenied') || response.includes('5.7.60')) {
    return 'Tài khoản SMTP không có quyền gửi thay địa chỉ MAIL_FROM_ADDRESS. Đặt MAIL_FROM_ADDRESS trùng với SMTP_USER hoặc xin quyền "Send As".';
  }
  if (response.includes('5.3.4') || smtp === 552 || response.includes('size')) {
    return 'Thư quá lớn. Giảm số lượng hoặc kích thước ảnh trong nội dung.';
  }
  if (response.includes('5.1.1') || response.includes('5.1.10') || response.includes('recipient')) {
    return 'Có địa chỉ người nhận không tồn tại hoặc bị từ chối. Kiểm tra lại các địa chỉ ở Gửi đến, CC và BCC.';
  }
  if (response.includes('5.7.708') || response.includes('5.7.750') || response.includes('spam')) {
    return 'Microsoft 365 đang chặn gửi từ tài khoản này (nghi spam hoặc vượt hạn mức). Liên hệ quản trị Microsoft 365.';
  }
  if (smtp === 421 || smtp === 450 || smtp === 451 || smtp === 452 || smtp === 429) {
    return 'Máy chủ tạm từ chối, thường do giới hạn tốc độ gửi. Hệ thống sẽ tự thử lại.';
  }
  if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ECONNREFUSED', 'ENOTFOUND', 'EDNS'].includes(code)) {
    return 'Không kết nối được máy chủ mail. Kiểm tra SMTP_HOST, SMTP_PORT, mạng hoặc tường lửa.';
  }
  if (code === 'ETLS' || response.includes('tls') || response.includes('certificate')) {
    return 'Lỗi mã hoá TLS. Kiểm tra SMTP_SECURE và SMTP_REQUIRE_TLS phù hợp với cổng đang dùng.';
  }
  if (summary === 'Không có người nhận') {
    return 'Lịch không còn nhóm hoặc địa chỉ nhận nào đang hoạt động. Mở lịch và chọn lại người nhận.';
  }
  if (summary === 'missed while offline') {
    return 'Hệ thống tắt quá lâu nên lần gửi này bị bỏ qua để tránh gửi trễ.';
  }
  if (summary === 'paused or deleted') {
    return 'Lịch đã tạm dừng hoặc bị xoá trước giờ gửi.';
  }
  return null;
}
