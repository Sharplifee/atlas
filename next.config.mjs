/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Build must not fail on lint; correctness is enforced by tsc + vitest.
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Server Actions are used by auth + onboarding forms.
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
