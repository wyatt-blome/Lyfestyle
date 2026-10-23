"use client";

import type { Worker } from "tesseract.js";

// The free on-device reader: Tesseract running in the browser, loaded from this app's own
// /ocr files. Good with printed recipes; handwriting needs the Claude reader.

let workerPromise: Promise<Worker> | null = null;
let onProgress: ((p: number) => void) | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, OEM } = await import("tesseract.js");
      const base = `${window.location.origin}/ocr`;
      return createWorker("eng", OEM.LSTM_ONLY, {
        workerPath: `${base}/worker.min.js`,
        corePath: base,
        langPath: `${base}/lang`,
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") onProgress?.(m.progress);
        },
      });
    })().catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

/** Grayscale and enlarge small photos a little; Tesseract reads cleaner input more reliably. */
async function prepare(image: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(image);
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = longest < 1600 ? 1600 / longest : longest > 2600 ? 2600 / longest : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.filter = "grayscale(1) contrast(1.25)";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

/** Read the text on one photo. `progress` gets 0..1 while it reads. */
export async function readPhotoText(image: Blob, progress?: (p: number) => void): Promise<string> {
  const worker = await getWorker();
  onProgress = progress ?? null;
  try {
    const { data } = await worker.recognize(await prepare(image));
    return data.text;
  } finally {
    onProgress = null;
  }
}
