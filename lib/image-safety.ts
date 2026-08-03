const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_EDGE = 2400;
const PREVIEW_EDGE = 512;

export type ModerationImagePreview = {
  mimeType: "image/webp";
  data: string;
  width: number;
  height: number;
  brightness: number;
  sharpness: number;
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

function measureImageQuality(context: CanvasRenderingContext2D, width: number, height: number) {
  const sampleWidth = Math.min(160, width);
  const sampleHeight = Math.min(160, height);
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = sampleWidth;
  sampleCanvas.height = sampleHeight;
  const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
  if (!sampleContext) return { brightness: 128, sharpness: 50 };
  sampleContext.drawImage(context.canvas, 0, 0, sampleWidth, sampleHeight);
  const { data } = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight);
  const luminance = new Float32Array(sampleWidth * sampleHeight);
  let total = 0;
  for (let pixel = 0, index = 0; pixel < data.length; pixel += 4, index += 1) {
    const value = data[pixel] * 0.2126 + data[pixel + 1] * 0.7152 + data[pixel + 2] * 0.0722;
    luminance[index] = value;
    total += value;
  }
  let edgeTotal = 0;
  let edgeCount = 0;
  for (let y = 1; y < sampleHeight - 1; y += 1) {
    for (let x = 1; x < sampleWidth - 1; x += 1) {
      const index = y * sampleWidth + x;
      const laplacian = Math.abs(
        4 * luminance[index]
        - luminance[index - 1]
        - luminance[index + 1]
        - luminance[index - sampleWidth]
        - luminance[index + sampleWidth],
      );
      edgeTotal += laplacian;
      edgeCount += 1;
    }
  }
  return {
    brightness: Math.round((total / Math.max(1, luminance.length)) * 10) / 10,
    sharpness: Math.round((edgeTotal / Math.max(1, edgeCount)) * 10) / 10,
  };
}

export async function sanitizeListingImage(file: File): Promise<SanitizedImage> {
  if (!ALLOWED_TYPES.has(file.type)) throw new Error("Use a JPG, PNG, or WebP image.");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("Each image must be 8 MB or smaller.");

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  if (bitmap.width < 240 || bitmap.height < 240) {
    bitmap.close();
    throw new Error("Use a clearer image at least 240 × 240 pixels.");
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error("This browser could not process the image safely.");
  }

  context.fillStyle = "#111111";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const quality = measureImageQuality(context, width, height);
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
      brightness: quality.brightness,
      sharpness: quality.sharpness,
    },
  };
}
