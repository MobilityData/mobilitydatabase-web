import { type MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  const isProd = process.env.VERCEL_ENV === 'production';

  return {
    rules: [
      {
        userAgent: '*',
        allow: isProd ? '/' : '',
        disallow: isProd
          ? ['/api/', '/*/account/', '/*/authed/', '/admin/']
          : '/',
      },
    ],
    sitemap: isProd ? 'https://mobilitydatabase.org/sitemap.xml' : undefined,
    host: 'https://mobilitydatabase.org',
  };
}
