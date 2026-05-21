import withBundleAnalyzer from '@next/bundle-analyzer';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
  analyzerMode: 'json',
});

// GitHub Pages serves from /ohmyperf/ subpath. Setting OHMYPERF_BASE_PATH
// in the deploy workflow keeps Cloudflare Pages (root) and other targets
// working without changes.
const basePath = process.env.OHMYPERF_BASE_PATH ?? '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  basePath,
  assetPrefix: basePath || undefined,
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  webpack(config, { isServer, webpack }) {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        process: 'process/browser',
      };
      config.plugins.push(
        new webpack.ProvidePlugin({
          process: 'process/browser',
        }),
      );
    }
    return config;
  },
};

export default bundleAnalyzer(withNextIntl(nextConfig));
