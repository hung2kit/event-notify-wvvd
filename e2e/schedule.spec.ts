import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.on('dialog', (dialog) => {
    void dialog.accept();
  });
});

test.describe.serial('quyền và gửi thư', () => {
  test('viewer, editor và admin khớp với API', async ({ page }) => {
    const title = 'Lịch của quản trị';
    await page.goto('/');
    await expect(page.locator('.user-meta small')).toHaveText('Quản trị');
    await saveSchedule(page, title, '2026-12-15', '08:00');
    await expect(page.getByRole('button', { name: `Sửa ${title}` })).toBeVisible();

    await loginAs(page, 'Minh');
    await expect(page.locator('.user-meta small')).toHaveText('Chỉ xem');
    await expect(page.getByRole('button', { name: 'Tạo thông báo' })).toHaveCount(0);
    await expect(page.getByRole('switch', { name: `Bật ${title}` })).toBeDisabled();
    await page.getByRole('button', { name: `Xem ${title}` }).click();
    await expect(page.getByRole('heading', { name: 'Xem thông báo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lưu lịch gửi' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Gửi thử cho tôi' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Xóa' })).toHaveCount(0);
    await expect(page.getByPlaceholder('Lịch nghỉ lễ Quốc khánh 2/9')).toBeDisabled();
    await page.getByRole('button', { name: 'Đóng' }).click();

    await loginAs(page, 'Lan');
    await expect(page.locator('.user-meta small')).toHaveText('Biên tập');
    await expect(page.getByRole('button', { name: 'Tạo thông báo', exact: true })).toBeVisible();
    await expect(page.getByRole('switch', { name: `Bật ${title}` })).toBeEnabled();
    await page.getByRole('button', { name: `Xem ${title}` }).click();
    await expect(page.getByRole('button', { name: 'Lưu lịch gửi' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Xóa' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Gửi thử cho tôi' })).toBeVisible();
    await page.getByRole('button', { name: 'Đóng' }).click();

    const own = 'Lịch của biên tập';
    await saveSchedule(page, own, '2026-12-16', '09:00');
    await page.getByRole('button', { name: `Sửa ${own}` }).click();
    await expect(page.getByRole('heading', { name: 'Sửa thông báo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lưu lịch gửi' })).toBeVisible();
    await page.getByRole('button', { name: 'Xóa' }).click();
    await expect(page.getByRole('button', { name: `Sửa ${own}` })).toHaveCount(0);
  });

  test('tạo lịch, thấy thư trong Mailpit, rồi Đã gửi ở lịch sử', async ({ page }) => {
    const mailpit = await fetch('http://127.0.0.1:8025/api/v1/info').catch(() => null);
    expect(mailpit?.ok, 'Hãy chạy docker compose up -d mailpit').toBe(true);

    const title = `E2E ${Date.now()}`;
    await page.goto('/');
    await expect(page.locator('.user-meta small')).toHaveText('Quản trị');
    const slot = futureSlot(45);
    await saveSchedule(page, title, slot.date, slot.time);
    await page.getByRole('switch', { name: `Bật ${title}` }).click();
    await expect(page.getByRole('switch', { name: `Tạm dừng ${title}` })).toBeVisible();

    await expect
      .poll(async () => mailSubjectSeen(title), { timeout: 140_000, intervals: [2_000] })
      .toBe(true);
    await expect
      .poll(async () => deliveryStatus(title), { timeout: 30_000, intervals: [1_000] })
      .toBe('sent');

    await page.goto('/history');
    await expect(
      page.getByRole('row').filter({ hasText: title }).getByText('Đã gửi'),
    ).toBeVisible();
  });
});

async function loginAs(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Tài khoản' }).click();
  await page.getByRole('menuitem', { name: 'Đăng xuất' }).click();
  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await expect(page.getByRole('heading', { name: 'Lịch gửi thông báo' })).toBeVisible();
}

async function saveSchedule(page: Page, title: string, date: string, time: string): Promise<void> {
  await page.getByRole('button', { name: 'Tạo thông báo', exact: true }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByPlaceholder('Lịch nghỉ lễ Quốc khánh 2/9').fill(title);
  await drawer.getByRole('button', { name: 'Email cá nhân' }).click();
  await drawer.locator('.ProseMirror').click();
  await page.keyboard.type('Nội dung kiểm tra gửi thư.');
  await drawer.locator('input[type="date"]').first().fill(date);
  await drawer.locator('input[type="time"]').fill(time);
  await drawer.getByRole('button', { name: 'Lưu lịch gửi' }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
}

function futureSlot(minLeadSeconds: number): { date: string; time: string } {
  const earliest = Date.now() + minLeadSeconds * 1000;
  let cursor = earliest;
  for (let step = 0; step < 3; step += 1) {
    const slot = formatSlot(new Date(cursor));
    const instant = Date.parse(`${slot.date}T${slot.time}:00+07:00`);
    if (instant >= earliest) return slot;
    cursor = instant + 60_000;
  }
  return formatSlot(new Date(cursor));
}

function formatSlot(when: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(when);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${pick('year')}-${pick('month')}-${pick('day')}`,
    time: `${pick('hour')}:${pick('minute')}`,
  };
}

async function mailSubjectSeen(subject: string): Promise<boolean> {
  const response = await fetch('http://127.0.0.1:8025/api/v1/messages');
  if (!response.ok) return false;
  const body = (await response.json()) as { messages?: { Subject?: string; subject?: string }[] };
  return (body.messages ?? []).some((message) => (message.Subject ?? message.subject) === subject);
}

async function deliveryStatus(title: string): Promise<string> {
  const response = await fetch('http://127.0.0.1:3100/api/deliveries');
  if (!response.ok) return '';
  const body = (await response.json()) as { deliveries?: { title: string; status: string }[] };
  return body.deliveries?.find((item) => item.title === title)?.status ?? '';
}
