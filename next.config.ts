import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      ...["i0.hdslb.com", "i1.hdslb.com", "i2.hdslb.com"].map((hostname) => ({
        protocol: "https" as const,
        hostname,
        port: "",
        pathname: "/bfs/**",
      })),
      { protocol: "https", hostname: "i.ytimg.com", port: "", pathname: "/vi/**" },
      { protocol: "https", hostname: "i.ytimg.com", port: "", pathname: "/vi_webp/**" },
    ],
  },
};

export default nextConfig;
