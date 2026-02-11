import { http, HttpResponse } from 'msw';

// Import fixtures
import feedJson from '../../cypress/fixtures/feed_test-516.json';
import gtfsFeedJson from '../../cypress/fixtures/gtfs_feed_test-516.json';
import datasetsFeedJson from '../../cypress/fixtures/feed_datasets_test-516.json';
import feed2947 from '../../cypress/fixtures/feed_mdb-2947.json';
import gtfsFeed2947 from '../../cypress/fixtures/gtfs_feed_mdb-2947.json';
import datasets2947 from '../../cypress/fixtures/feed_datasets_mdb-2947.json';

export const handlers = [
  // Mock search endpoint: return a list including test-516 and mdb-2947
  http.get(`*/v1/search`, () => {
    return HttpResponse.json({
      total: 2,
      results: [
        {
          id: 'test-516',
          data_type: 'gtfs',
          feed_name: gtfsFeedJson.feed_name,
          provider: gtfsFeedJson.provider,
          official: false,
          locations: gtfsFeedJson.locations ?? [],
          entity_types: [],
        },
        {
          id: 'mdb-2947',
          data_type: 'gtfs',
          feed_name: gtfsFeed2947.feed_name,
          provider: gtfsFeed2947.provider,
          official: false,
          locations: gtfsFeed2947.locations ?? [],
          entity_types: [],
        },
      ],
    });
  }),
  // Mock GET /v1/feeds/{id} - basic feed info
  http.get(`*/v1/feeds/test-516`, () => {
    return HttpResponse.json(feedJson);
  }),

  // Mock GET /v1/feeds/{id} - basic feed info
  http.get(`*/v1/feeds/*/test-516`, () => {
    return HttpResponse.json(feedJson);
  }),

  // Mock GET /v1/gtfs_feeds/{id} - GTFS specific feed info
  http.get(`*/v1/gtfs_feeds/test-516`, () => {
    return HttpResponse.json(gtfsFeedJson);
  }),

  // Mock GET /v1/gtfs_feeds/{id}/datasets - feed datasets
  http.get(`*/v1/gtfs_feeds/test-516/datasets`, () => {
    return HttpResponse.json(datasetsFeedJson);
  }),

  // Mock GET /v1/gtfs_feeds/{id}/gtfs_rt_feeds - associated GTFS-RT feeds
  http.get(`*/v1/gtfs_feeds/test-516/gtfs_rt_feeds`, () => {
    return HttpResponse.json([]);
  }),

  // Mock routes endpoint for map visualization
  http.get(/.*test-516.*routes\.json$/, () => {
    return HttpResponse.json([]);
  }),

  // --- mdb-2947 ---
  http.get(`*/v1/feeds/mdb-2947`, () => {
    return HttpResponse.json(feed2947);
  }),
  http.get(`*/v1/gtfs_feeds/mdb-2947`, () => {
    return HttpResponse.json(gtfsFeed2947);
  }),
  http.get(`*/v1/gtfs_feeds/mdb-2947/datasets`, () => {
    return HttpResponse.json(datasets2947);
  }),
  http.get(`*/v1/gtfs_feeds/mdb-2947/gtfs_rt_feeds`, () => {
    return HttpResponse.json([]);
  }),
];
