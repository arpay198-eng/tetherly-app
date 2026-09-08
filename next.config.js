/** @type {import('next').NextConfig} */
// Default: normal Next.js build (used by `next start` for the localhost server).
// APK/static export: set NEXT_STATIC=1 so the build emits the `out/` folder for Capacitor.
const isStaticExport = process.env.NEXT_STATIC === '1';

const nextConfig = {
  reactStrictMode: true,
  output: isStaticExport ? 'export' : undefined,
  images: {
    unoptimized: true,
  },
  experimental: {
    instrumentationHook: true,
  },
}

module.exports = nextConfig
