import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Middleware clones request bodies (default 10MB). Onboarding headshots can be
  // larger phone photos; truncated multipart bodies fail with
  // "Failed to parse body as FormData." Match client-headshots storage limit.
  experimental: {
    proxyClientMaxBodySize: "30mb",
  },
  async rewrites() {
    return [
      // Public client offer pages (static HTML under public/offers/)
      {
        source: "/offers/team-westside",
        destination: "/offers/team-westside/index.html",
      },
      {
        source: "/offers/team-westside/",
        destination: "/offers/team-westside/index.html",
      },
      {
        source: "/offers/team-westside/pay",
        destination: "/offers/team-westside/pay.html",
      },
      {
        source: "/offers/team-westside/post-pay",
        destination: "/offers/team-westside/post-pay.html",
      },
    ];
  },
};

export default nextConfig;
