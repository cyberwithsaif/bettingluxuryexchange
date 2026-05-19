/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@exch/shared"],
  experimental: { typedRoutes: false },
  generateBuildId: async () => {
    return `build-${Date.now()}`;
  },
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
    }];
  },
};
export default nextConfig;
