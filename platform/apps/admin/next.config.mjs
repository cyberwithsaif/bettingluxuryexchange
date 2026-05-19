/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: "/admin",
  reactStrictMode: true,
  transpilePackages: ["@exch/shared"],
  generateBuildId: async () => {
    return `build-${Date.now()}`;
  },
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_ADMIN_API_BASE ?? "http://localhost:4000";
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
};
export default nextConfig;
