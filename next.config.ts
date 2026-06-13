import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            // Declare microphone permission so browsers allow it when embedded
            key: "Permissions-Policy",
            value: "microphone=*",
          },
        ],
      },
    ]
  },
}

export default nextConfig
