import type { NextConfig } from "next";

// The default build is a full Next.js server app (Vercel or any Node host):
// dynamic routes, ISR, and a server-only Congress.gov API key all require it.
//
// Setting STATIC_EXPORT=true switches to `output: "export"` for a static GitHub Pages *demo* build. A static export
// cannot hold a secret API key, so that build always renders clearly labeled preview data — never live
// congressional records. See the "GitHub Pages" section of the README.
const isStaticExport: boolean = process.env.STATIC_EXPORT === "true";

const nextConfig: NextConfig = {
  typedRoutes: true,
  ...(isStaticExport
    ? {
        output: "export",
        basePath: process.env.GITHUB_PAGES_BASE_PATH ?? "",
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
