import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  //assetPrefix: process.env.ASSET_PREFIX, // https://static.example.com This would be the URL to the CDN where static assets are hosted
};

export default withNextIntl(nextConfig);
