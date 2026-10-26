import type { NextConfig } from "next";

const supabaseImagePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [];
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

if (supabaseUrl) {
  const url = new URL(supabaseUrl);
  const protocol = url.protocol === "https:" ? "https" : url.protocol === "http:" ? "http" : null;

  if (protocol) {
    supabaseImagePatterns.push({
      protocol,
      hostname: url.hostname,
      port: url.port,
      pathname: "/storage/v1/object/public/restaurant-assets/**",
      search: "",
    });
  }
}

supabaseImagePatterns.push({
  protocol: "https",
  hostname: "images.unsplash.com",
  pathname: "/photo-**",
});

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseImagePatterns,
  },
};

export default nextConfig;
