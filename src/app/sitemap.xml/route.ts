import { NextResponse } from 'next/server';

const SITEMAP_SOURCE_URL =
  'https://storage.googleapis.com/mobilitydatabase-sitemap-prod/sitemap.xml';

const FALLBACK_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url>
    <loc>https://mobilitydatabase.org/feeds/</loc>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
</url>
</urlset>
`;

/**
 * The sitemap is regenerated externally and stored in a GCS bucket once a day.
 * This proxies it verbatim so mobilitydatabase.org/sitemap.xml (the URL already
 * registered with search engines, see robots.ts) keeps serving it same-origin.
 */
export async function GET(): Promise<NextResponse> {
  const isProd = process.env.VERCEL_ENV === 'production';
  if (!isProd) {
    return new NextResponse(FALLBACK_SITEMAP, {
      headers: { 'Content-Type': 'application/xml' },
    });
  }

  try {
    const response = await fetch(SITEMAP_SOURCE_URL, {
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      throw new Error(`Sitemap fetch failed with status ${response.status}`);
    }

    const xml = await response.text();
    return new NextResponse(xml, {
      headers: { 'Content-Type': 'application/xml' },
    });
  } catch (error) {
    console.error('Failed to fetch generated sitemap:', error);
    return new NextResponse(FALLBACK_SITEMAP, {
      headers: { 'Content-Type': 'application/xml' },
    });
  }
}
