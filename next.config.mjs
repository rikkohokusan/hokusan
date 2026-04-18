/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Cloudflare Pages runs edge runtime by default via @cloudflare/next-on-pages.
  // Individual route files can opt in with `export const runtime = 'edge'`.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
