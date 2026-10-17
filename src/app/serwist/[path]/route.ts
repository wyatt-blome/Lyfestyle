import { createSerwistRoute } from "@serwist/turbopack";
import { APP_ROUTES } from "@/ui/routes";

// One revision per build, so every screen's cached HTML refreshes together.
const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? `${Date.now()}`;

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "src/app/sw.ts",
  useNativeEsbuild: true,
  // Every screen is a static page rendered on the device, so precaching them all makes the
  // whole app open offline after the first visit.
  additionalPrecacheEntries: APP_ROUTES.map((url) => ({ url, revision })),
});
