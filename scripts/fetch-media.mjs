#!/usr/bin/env node
/**
 * Prebuild: download every exercise demo (ExerciseDB GIFs, wger images) to public/media and write
 * src/seed/media-manifest.json mapping remote URL → local path. Anything that fails to download is
 * left out of the manifest, and the app falls back to the remote URL (cached by the service worker
 * on first view). Never fails the build.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

const root = join(import.meta.dirname, "..");
const outDir = join(root, "public/media");
const manifestPath = join(root, "src/seed/media-manifest.json");
const exercises = JSON.parse(readFileSync(join(root, "src/seed/exercises.json"), "utf8"));

const urls = [...new Set(exercises.flatMap((e) => [e.media.gifUrl, e.media.gifUrl2, e.media.imageUrl]).filter(Boolean))];
mkdirSync(outDir, { recursive: true });

const manifest = {};
let ok = 0;
await Promise.all(
  urls.map(async (url) => {
    const name = createHash("sha1").update(url).digest("hex").slice(0, 12) + (extname(new URL(url).pathname) || ".bin");
    const file = join(outDir, name);
    try {
      if (!existsSync(file)) {
        const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "FastAndMove/0.1 (personal use)" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      }
      manifest[url] = `/media/${name}`;
      ok++;
    } catch (e) {
      console.warn(`[media] kept remote: ${url} (${e.message ?? e})`);
    }
  }),
);

writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + "\n");
console.log(`[media] ${ok}/${urls.length} demos cached locally`);
