/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: "/bookie",
  reactStrictMode: true,
  transpilePackages: ["@exch/shared"],
  compress: true,
  poweredByHeader: false,
  generateBuildId: async () => `build-${Date.now()}`,
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_BOOKIE_API_BASE ?? "http://localhost:4000";
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
};
export default nextConfig;
