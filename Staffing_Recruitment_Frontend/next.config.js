/** @type {import('next').NextConfig} */
const backendBaseUrl = (process.env.BACKEND_BASE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');

const nextConfig = {
  // Hide Next.js dev indicator "N" bubble in development UI.
  devIndicators: false,
  // Allow dev assets / HMR when opening the app via LAN IP (not only localhost).
  // Hostnames only (no port). Add more IPs from `ipconfig` if you use another NIC.
  allowedDevOrigins: [
    '192.168.1.10',
    '192.168.1.168',
    '192.168.1.152',
    '127.0.0.1',
    'www.metaforgerecruitment.com',
    'metaforgerecruitment.com',
    'myapps.taskforge.com',
    'www.myapps.taskforge.com',
  ],
  // Faster dev + smaller module graphs: tree-shake these barrel-heavy packages.
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'react-icons',
      'framer-motion',
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendBaseUrl}/api/:path*`,
      },
      {
        source: '/health',
        destination: `${backendBaseUrl}/health`,
      },
      {
        source: '/api-docs',
        destination: `${backendBaseUrl}/api-docs`,
      },
    ];
  },
};

module.exports = nextConfig;

