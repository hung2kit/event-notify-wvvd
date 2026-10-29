const MAX_EDGE = 1280;
const MAX_BYTES = 1_500_000;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export async function fileToEditorImage(file: File): Promise<{ src: string; width: number }> {
  if (!ALLOWED.has(file.type)) {
    throw new Error('Chỉ nhận ảnh JPG, PNG, GIF hoặc WebP');
  }
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Không xử lý được ảnh');
    context.drawImage(bitmap, 0, 0, width, height);
    const preferPng = file.type === 'image/png' || file.type === 'image/gif';
    let src = canvas.toDataURL(preferPng ? 'image/png' : 'image/jpeg', 0.82);
    if (src.length > MAX_BYTES) {
      src = canvas.toDataURL('image/jpeg', 0.7);
    }
    if (src.length > MAX_BYTES) {
      throw new Error('Ảnh quá lớn. Chọn ảnh nhỏ hơn hoặc thu nhỏ trước khi chèn.');
    }
    return { src, width };
  } finally {
    bitmap.close();
  }
}
