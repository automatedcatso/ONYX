const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_EDGE = 2400;
const PREVIEW_EDGE = 512;

export type ModerationImagePreview = {
  mimeType: "image/webp";
  data: string;
  width: number;
  height: number;
};

export type SanitizedImage = {
  blob: Blob;
  width: number;
  height: number;
  moderationPreview: ModerationImagePreview;
};

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
}

function dataUrlPayload(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

export async function sanitizeListingImage(file: File): Promise<SanitizedImage> {
  if (!ALLOWED_TYPES.has(file.type)) throw new Error("Use a JPG, PNG, or WebP image.");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("Each image must be 8 MB or smaller.");

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  if (bitmap.width < 240 || bitmap.height < 240) {
    bitmap.close();
    throw new Error("Use an image at least 240 × 240 pixels.");
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    bitmap.close();
    throw new Error("This browser could not process the image safely.");
  }

  context.fillStyle = "#111111";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await canvasToBlob(canvas, 0.84);
  if (!blob) throw new Error("Image re-encoding failed.");

  const previewScale = Math.min(1, PREVIEW_EDGE / Math.max(width, height));
  const previewCanvas = document.createElement("canvas");
  previewCanvas.width = Math.max(1, Math.round(width * previewScale));
  previewCanvas.height = Math.max(1, Math.round(height * previewScale));
  const previewContext = previewCanvas.getContext("2d", { alpha: false });
  if (!previewContext) throw new Error("Image preview processing failed.");
  previewContext.fillStyle = "#111111";
  previewContext.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
  previewContext.drawImage(canvas, 0, 0, previewCanvas.width, previewCanvas.height);

  return {
    blob,
    width,
    height,
    moderationPreview: {
      mimeType: "image/webp",
      data: dataUrlPayload(previewCanvas.toDataURL("image/webp", 0.7)),
      width,
      height,
    },
  };
}
