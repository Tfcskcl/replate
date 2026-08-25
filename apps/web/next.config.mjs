/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const rules = [];
    if (process.env.NEXT_PUBLIC_API_URL) {
      rules.push({
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL}/api/:path*`,
      });
    }
    if (process.env.NEXT_PUBLIC_WS_URL) {
      rules.push({
        source: "/ws/:path*",
        destination: `${process.env.NEXT_PUBLIC_WS_URL}/ws/:path*`,
      });
    }
    return rules;
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "videos.re-plate.in" },
      { protocol: "https", hostname: "*.r2.cloudflarestorage.com" },
    ],
  },
};

export default nextConfig;
