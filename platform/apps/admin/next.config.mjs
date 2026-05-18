/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@exch/shared"],
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_ADMIN_API_BASE ?? "http://localhost:4000";
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
};
export default nextConfig;
