import { type MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const isProd = process.env.VERCEL_ENV === 'production';

  return {
    rules: [
      {
        userAgent: '*',
        allow: isProd ? '/' : '',
        disallow: isProd ? '' : '/',
      },
    ],
    sitemap: isProd ? 'https://mobilitydatabase.org/sitemap.xml' : undefined,
  };
}
