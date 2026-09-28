/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Product images / store logos are stored inline as data: URLs, so no remote
  // image hosts are needed.
  // Server actions default to a 1MB body; a product gallery save can carry up
  // to 3MB of images (see MAX total in app/products/actions.ts).
  experimental: {
    serverActions: { bodySizeLimit: '4mb' },
  },
};

export default nextConfig;
