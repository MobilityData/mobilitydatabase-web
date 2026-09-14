import React from 'react';

/**
 * Root JSON-LD Schema structured data for MobilityDatabase.
 * Defines Organization and WebSite schemas with SearchAction
 * to enable Google Sitelinks Search Box and rich organizational knowledge graph.
 */
export default function RootJsonLd(): React.ReactElement {
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://mobilitydatabase.org/#organization',
        name: 'MobilityData',
        url: 'https://mobilitydata.org',
        logo: {
          '@type': 'ImageObject',
          url: 'https://mobilitydatabase.org/apple-touch-icon.png',
        },
        sameAs: [
          'https://twitter.com/MobilityDataIO',
          'https://github.com/MobilityData',
          'https://www.linkedin.com/company/mobilitydata/',
        ],
      },
      {
        '@type': 'WebSite',
        '@id': 'https://mobilitydatabase.org/#website',
        url: 'https://mobilitydatabase.org',
        name: 'MobilityDatabase',
        description:
          'The Global Catalog of GTFS, GTFS-Realtime, and GBFS Feeds from 100+ countries.',
        publisher: {
          '@id': 'https://mobilitydatabase.org/#organization',
        },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate:
              'https://mobilitydatabase.org/feeds?search={search_term_string}',
          },
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  };

  return (
    <script
      type='application/ld+json'
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
