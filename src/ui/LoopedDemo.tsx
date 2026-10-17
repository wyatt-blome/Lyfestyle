"use client";
// The demo for a move. Render order (spec): own clip (only if the file exists) → primary demo
// (ExerciseDB GIF, or wger image with credit; the cached /media copy first, then the remote URL)
// → YouTube embed (looped to the start/end) → the cues as text.
import { useEffect, useRef, useState } from "react";
import type { Exercise } from "@/lib/types";
import manifest from "@/seed/media-manifest.json";
import { Badge } from "./kit";

const local = manifest as Record<string, string>;

export function mediaUrls(e: Exercise): string[] {
  return [e.media.gifUrl, e.media.gifUrl2, e.media.imageUrl].filter((u): u is string => !!u).map((u) => local[u] ?? u);
}

function ImageWithFallback({ src, alt, onFail }: { src: string; alt: string; onFail: () => void }) {
  const cached = local[src];
  const [url, setUrl] = useState(cached ?? src);
  return (
    // Animated GIFs from two hosts: next/image would re-encode and lose the animation.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      className="h-full w-full object-contain"
      onError={() => {
        if (url !== src) setUrl(src);
        else onFail();
      }}
    />
  );
}

export function LoopedDemo({ exercise, size = "md" }: { exercise: Exercise; size?: "sm" | "md" | "lg" }) {
  const m = exercise.media;
  const [ownOk, setOwnOk] = useState(!!m.ownClip);
  const [primaryOk, setPrimaryOk] = useState(true);
  const h = size === "lg" ? "h-64" : size === "sm" ? "h-24" : "h-48";
  const box = `relative ${h} w-full overflow-hidden rounded-2xl bg-white`;

  let body: React.ReactNode = null;
  if (m.ownClip && ownOk) {
    body = (
      <div className={box}>
        <video src={m.ownClip} autoPlay loop muted playsInline className="h-full w-full object-contain" onError={() => setOwnOk(false)} />
      </div>
    );
  } else if (primaryOk && m.primary !== "none" && (m.gifUrl || m.imageUrl)) {
    const srcs = [m.gifUrl ?? m.imageUrl!, m.gifUrl2].filter((x): x is string => !!x);
    body = (
      <div className={`${box} ${srcs.length > 1 ? "grid grid-cols-2 gap-1" : ""}`}>
        {srcs.map((s) => (
          <ImageWithFallback key={s} src={s} alt={`${exercise.name} demo`} onFail={() => setPrimaryOk(false)} />
        ))}
      </div>
    );
  } else if (m.youtube) {
    body = <YouTubeLoop {...m.youtube} title={exercise.name} className={h} />;
  }

  return (
    <figure className="flex flex-col gap-1">
      {body ?? (
        <div className={`flex ${size === "sm" ? "h-24" : "min-h-24"} flex-col justify-center rounded-2xl border border-dashed border-line p-3`}>
          <p className="text-sm uppercase tracking-wide text-muted">No demo: follow the cues</p>
          {size !== "sm" && (
            <ul className="mt-1 list-disc pl-5 text-base">
              {exercise.cues.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {body && (
        <figcaption className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {m.approx && <Badge tone="warn">Similar movement</Badge>}
          {m.credit && <span>{m.credit}</span>}
        </figcaption>
      )}
    </figure>
  );
}

interface YTPlayer {
  seekTo(s: number, allow: boolean): void;
  playVideo(): void;
  destroy(): void;
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: unknown) => YTPlayer;
  PlayerState: { ENDED: number };
}

let ytReady: Promise<YTNamespace> | null = null;
function loadYT(): Promise<YTNamespace> {
  const w = window as unknown as { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) return Promise.resolve(w.YT);
  ytReady ??= new Promise((resolve) => {
    w.onYouTubeIframeAPIReady = () => resolve(w.YT!);
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return ytReady;
}

/** A muted, inline YouTube clip that seeks back to `start` when it reaches `end`. */
function YouTubeLoop({ videoId, start, end, title, className }: { videoId: string; start: number; end: number; title: string; className: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let player: YTPlayer | null = null;
    let cancelled = false;
    void loadYT().then((YT) => {
      if (cancelled || !ref.current) return;
      player = new YT.Player(ref.current, {
        host: "https://www.youtube-nocookie.com",
        videoId,
        playerVars: { start, end, loop: 1, playlist: videoId, mute: 1, playsinline: 1, controls: 0, rel: 0 },
        events: {
          onReady: (e: { target: YTPlayer }) => e.target.playVideo(),
          onStateChange: (e: { data: number; target: YTPlayer }) => {
            if (e.data === YT.PlayerState.ENDED) {
              e.target.seekTo(start, true);
              e.target.playVideo();
            }
          },
        },
      });
    });
    return () => {
      cancelled = true;
      player?.destroy();
    };
  }, [videoId, start, end]);
  return (
    <div className={`${className} w-full overflow-hidden rounded-2xl bg-black`} aria-label={`${title} video`}>
      <div ref={ref} className="h-full w-full" />
    </div>
  );
}

/** Ask the service worker to cache today's demos ahead of time. */
export function warmMedia(urls: string[]): void {
  if (typeof window === "undefined" || !navigator.onLine) return;
  for (const u of urls) void fetch(u, { mode: u.startsWith("/") ? "same-origin" : "no-cors" }).catch(() => {});
}
