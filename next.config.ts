import type { NextConfig } from "next";

// The default build is a full Next.js server app (Vercel or any Node host): dynamic routes, ISR, and a server-only
// Congress.gov API key all require it.
//
// Setting STATIC_EXPORT=true switches to `output: "export"` for a static GitHub Pages *demo* build. A static export
// cannot hold a secret API key, so that build always renders clearly labeled preview data — never live congressional
// records. See the "GitHub Pages" section of the README.
const isStaticExport: boolean = process.env.STATIC_EXPORT === "true";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // Playwright drives the dev server over 127.0.0.1 (see playwright.config.ts), which Next treats as a cross-origin
  // host distinct from localhost and refuses to serve dev-only assets to. Nothing in the suite depends on those assets,
  // so the run passed anyway — it just printed a block warning per page load, which is exactly the kind of routine
  // noise that trains you to stop reading e2e output. Development-only; the setting has no production effect.
  allowedDevOrigins: ["127.0.0.1"],
  ...(isStaticExport
    ? {
        output: "export",
        basePath: process.env.GITHUB_PAGES_BASE_PATH ?? "",
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
