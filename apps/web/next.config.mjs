/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Preview is proxied by Arena.ai on a sandbox subdomain.
  allowedDevOrigins: ['*.e2b.app', '127.0.0.1', 'localhost'],
  poweredByHeader: false,
};
export default nextConfig;
