import { type ReactElement } from 'react';

// Schema.org graph for the home page. Three entities, all addressable by
// @id so later pages can reference them instead of repeating them:
//
//   Organization  — who publishes the catalog (knowledge panel, sameAs)
//   WebSite       — the site itself, plus the SearchAction that makes the
//                   feeds search eligible for a sitelinks searchbox
//   DataCatalog   — what this site *is*, which is how Google Dataset Search
//                   and non-rendering AI crawlers understand a catalog of
//                   6000+ feeds without parsing the page's visuals.
//
// Everything here is stated in English and uses the unprefixed canonical
// host: these are the same real-world entities on /fr, so the locales share
// one description of them rather than declaring two.

const SITE_URL = 'https://mobilitydatabase.org';
const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': ORGANIZATION_ID,
      name: 'MobilityData',
      url: 'https://mobilitydata.org/',
      description:
        'A non-profit that improves and maintains open mobility data formats, including GTFS, GTFS-Realtime and GBFS.',
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/assets/MOBILTYDATA_logo_light_blue_M.png`,
      },
      sameAs: [
        'https://github.com/MobilityData',
        'https://www.linkedin.com/company/mobilitydata/',
      ],
    },
    {
      '@type': 'WebSite',
      '@id': WEBSITE_ID,
      url: SITE_URL,
      name: 'Mobility Database',
      description:
        'The global catalog of GTFS, GTFS-Realtime and GBFS public transit feeds.',
      publisher: { '@id': ORGANIZATION_ID },
      inLanguage: ['en', 'fr'],
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${SITE_URL}/feeds?q={search_term_string}`,
        },
        // Schema.org's required spelling for a search input; it is a literal
        // property name, not a typo.
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'DataCatalog',
      '@id': `${SITE_URL}/#catalog`,
      name: 'Mobility Database',
      alternateName: 'The Mobility Database',
      url: SITE_URL,
      description:
        'An open catalog of over 6000 public transit feeds from more than 100 countries, in the GTFS Schedule, GTFS-Realtime and GBFS formats. Each feed entry carries its source, licence, location and validation history, and the whole catalog is queryable through a free REST API.',
      provider: { '@id': ORGANIZATION_ID },
      isPartOf: { '@id': WEBSITE_ID },
      isAccessibleForFree: true,
      inLanguage: ['en', 'fr'],
      keywords: [
        'GTFS',
        'GTFS Schedule',
        'GTFS-Realtime',
        'GBFS',
        'public transit',
        'open data',
        'transit feeds',
        'mobility data',
        'transit schedules',
        'bikeshare',
      ],
    },
  ],
};

/**
 * JSON-LD for the home page. Rendered as a plain script tag rather than
 * through `metadata`, which has no structured-data field.
 */
export default function HomeStructuredData(): ReactElement {
  return (
    <script
      type='application/ld+json'
      // The payload is a module-level constant with no user input; escaping
      // `<` still keeps a future string from closing the script element.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(structuredData).replace(/</g, '\\u003c'),
      }}
    />
  );
}
