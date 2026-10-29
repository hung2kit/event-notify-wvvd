import { expect, test } from '@playwright/test';

const sizes = [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 900, height: 800 },
];

for (const size of sizes) {
  test(`dropdown Lặp lại mở bằng chuột trong popup ${size.width}x${size.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await page.goto('/');
    await page.getByRole('button', { name: 'Tạo thông báo' }).click();
    const trigger = page.getByRole('combobox', { name: 'Lặp lại' });
    await trigger.scrollIntoViewIfNeeded();
    const box = await trigger.boundingBox();
    if (!box) throw new Error('trigger has no box');
    const middleY = box.y + box.height / 2;
    const spots = [box.x + 30, box.x + box.width / 2, box.x + box.width - 18];

    for (const x of spots) {
      await page.mouse.click(x, middleY);
      const option = page.getByRole('option', { name: 'Hằng tuần' });
      await expect(option).toBeVisible();
      const optionBox = await option.boundingBox();
      if (!optionBox) throw new Error('option has no box');
      const topText = await page.evaluate(
        ([px, py]) => document.elementFromPoint(px, py)?.textContent ?? '',
        [optionBox.x + 20, optionBox.y + optionBox.height / 2],
      );
      expect(topText).toContain('Hằng tuần');
      await page.keyboard.press('Escape');
      await expect(option).toHaveCount(0);
    }

    await page.mouse.click(box.x + 30, middleY);
    await page.getByRole('option', { name: 'Hằng tuần' }).click();
    await expect(trigger).toHaveText(/Hằng tuần/);
    await expect(page.getByRole('heading', { name: 'Tạo thông báo' })).toBeVisible();
  });
}
