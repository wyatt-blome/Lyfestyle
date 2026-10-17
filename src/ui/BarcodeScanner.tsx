"use client";
// Barcode capture: the browser's BarcodeDetector with the rear camera when it exists (Chrome on
// Android, recent Safari), otherwise the number typed in by hand.
import { useCallback, useEffect, useRef, useState } from "react";
import { isValidBarcode } from "@/lib/off";
import { Button, Field, Notice } from "./kit";

// BarcodeDetector isn't in TypeScript's DOM lib yet; this is the part we use.
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorCtor {
  new (opts?: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "itf"];

function detectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  return ((window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null);
}

/**
 * TODO(@zxing/browser): fallback decoder for browsers without BarcodeDetector (Firefox, older
 * iOS). Not approved yet (> 100 kB, see DECISIONS-phase3 P3-4). When approved, return a detector
 * here, loaded with a dynamic import() so it stays out of the main bundle.
 */
async function fallbackDetector(): Promise<BarcodeDetectorLike | null> {
  return null;
}

async function makeDetector(): Promise<BarcodeDetectorLike | null> {
  const Ctor = detectorCtor();
  if (!Ctor) return fallbackDetector();
  try {
    const supported = (await Ctor.getSupportedFormats?.()) ?? FORMATS;
    const formats = FORMATS.filter((f) => supported.includes(f));
    if (formats.length === 0) return fallbackDetector();
    return new Ctor({ formats });
  } catch {
    return fallbackDetector();
  }
}

export function BarcodeScanner({ onCode, disabled }: { onCode: (code: string) => void; disabled?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const [canScan, setCanScan] = useState<boolean | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    let live = true;
    const hasCamera = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
    void makeDetector().then((d) => live && setCanScan(!!d && hasCamera));
    return () => {
      live = false;
    };
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => stop, [stop]);

  const start = async () => {
    setError(null);
    const detector = await makeDetector();
    if (!detector) return setCanScan(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setScanning(true);
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      const loop = async () => {
        if (!streamRef.current) return;
        try {
          if (video.readyState >= 2) {
            const hit = (await detector.detect(video)).find((b) => isValidBarcode(b.rawValue));
            if (hit) {
              stop();
              navigator.vibrate?.(60);
              onCode(hit.rawValue);
              return;
            }
          }
        } catch {
          // A frame that fails to decode is normal; keep going.
        }
        timerRef.current = window.setTimeout(loop, 200);
      };
      void loop();
    } catch (e) {
      stop();
      const name = (e as Error).name;
      setError(
        name === "NotAllowedError"
          ? "Camera permission was denied. Allow it in the browser settings, or type the number below."
          : "Couldn't start the camera. Type the number below.",
      );
    }
  };

  const digits = manual.replace(/\D/g, "");

  return (
    <div className="flex flex-col gap-3">
      {canScan && (
        <>
          <div className={`overflow-hidden rounded-2xl bg-black ${scanning ? "" : "hidden"}`}>
            <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full object-cover" aria-label="Camera view" />
          </div>
          {scanning ? (
            <Button onClick={stop}>Stop camera</Button>
          ) : (
            <Button variant="primary" big disabled={disabled} onClick={start}>
              Scan with camera
            </Button>
          )}
          {scanning && <p className="text-sm text-muted">Hold the barcode flat and steady, filling most of the frame.</p>}
        </>
      )}
      {canScan === false && (
        <Notice tone="info">This browser can&apos;t read barcodes from the camera. Type the number under the bars instead.</Notice>
      )}
      {error && <Notice tone="bad">{error}</Notice>}
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (isValidBarcode(digits)) onCode(digits);
        }}
      >
        <Field label="Barcode number" hint="6–14 digits">
          <input inputMode="numeric" autoComplete="off" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="0 12345 67890 5" />
        </Field>
        <Button type="submit" disabled={disabled || !isValidBarcode(digits)}>
          Look up
        </Button>
      </form>
    </div>
  );
}
