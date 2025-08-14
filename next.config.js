/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@prisma/client'],
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
  },
}

// Set the port to 4001
if (process.env.NODE_ENV !== 'production') {
  process.env.PORT = '4001'
}

module.exports = nextConfig
