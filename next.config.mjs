/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Grok Voice needs mic access even when the app is embedded (e.g. v0 preview).
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Permissions-Policy",
            value: "microphone=*",
          },
        ],
      },
    ]
  },
}

export default nextConfig
