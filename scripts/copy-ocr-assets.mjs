// Copies the on-device text reader (Tesseract) into public/ocr so phones load it from this app
// instead of a third-party CDN. Runs after npm install.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "public", "ocr");
const dir = (pkg) => path.dirname(require.resolve(`${pkg}/package.json`));

const files = [
  [path.join(dir("tesseract.js"), "dist", "worker.min.js"), "worker.min.js"],
  // LSTM-only builds: the reader picks the fastest one the phone supports.
  ...["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"].map((f) => [
    path.join(dir("tesseract.js-core"), f),
    f,
  ]),
  [path.join(dir("@tesseract.js-data/eng"), "4.0.0_best_int", "eng.traineddata.gz"), "lang/eng.traineddata.gz"],
];

mkdirSync(path.join(out, "lang"), { recursive: true });
for (const [from, to] of files) {
  if (!existsSync(from)) {
    console.warn(`[ocr] missing ${from}; photo reading on the phone will be unavailable`);
    continue;
  }
  copyFileSync(from, path.join(out, to));
}
console.log(`[ocr] copied ${files.length} files to public/ocr`);
