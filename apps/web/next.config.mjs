const apiInternalUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

function parseApiInternalUrl(value) {
  const url = new URL(value);

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('API_INTERNAL_URL must be an HTTP(S) URL without credentials.');
  }

  return url.toString().replace(/\/$/, '');
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@familystar/shared'],
  experimental: {
    outputFileTracingRoot: new URL('../..', import.meta.url).pathname,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${parseApiInternalUrl(apiInternalUrl)}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
