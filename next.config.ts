import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
