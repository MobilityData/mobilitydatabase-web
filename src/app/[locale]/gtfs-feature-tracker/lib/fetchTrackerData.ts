/* eslint-disable */
// This file currently retrieves all data to display gtfs feature tracking information
// In the future when this data will come from the database, this file can be removed and the data fetching logic can be moved to the page.tsx file

import type {
  Consumer,
  Feature,
  FeatureSupport,
  TrackerData,
} from '../components/types';

const CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSu9_3lyF9caXrDdlGCtO1Bg17Uhkh_L9l-REYkYVUINvrEEaVwrx1mSZ--_iKAGcJ2x8bFBzYHVU74/pub?output=csv';
const CATEGORIES_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSu9_3lyF9caXrDdlGCtO1Bg17Uhkh_L9l-REYkYVUINvrEEaVwrx1mSZ--_iKAGcJ2x8bFBzYHVU74/pub?gid=1998786437&single=true&output=csv';
const FIELDS_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSu9_3lyF9caXrDdlGCtO1Bg17Uhkh_L9l-REYkYVUINvrEEaVwrx1mSZ--_iKAGcJ2x8bFBzYHVU74/pub?gid=1909638109&single=true&output=csv';

const GTFS_DOCS_BASE = 'https://gtfs.org/documentation/schedule/reference/';

export const DOCS_URL_MAP: Record<string, string> = {
  Agency: `${GTFS_DOCS_BASE}#agencytxt`,
  Stops: `${GTFS_DOCS_BASE}#stopstxt`,
  Routes: `${GTFS_DOCS_BASE}#routestxt`,
  'Service Dates': `${GTFS_DOCS_BASE}#calendartxt`,
  Trips: `${GTFS_DOCS_BASE}#tripstxt`,
  'Stop Times': `${GTFS_DOCS_BASE}#stop_timestxt`,
  'Feed Information': `${GTFS_DOCS_BASE}#feed_infotxt`,
  Shapes: `${GTFS_DOCS_BASE}#shapestxt`,
  'Route Colors': `${GTFS_DOCS_BASE}#routestxt`,
  'Bike Allowed': `${GTFS_DOCS_BASE}#tripstxt`,
  Headsigns: `${GTFS_DOCS_BASE}#tripstxt`,
  'Location Types': `${GTFS_DOCS_BASE}#stopstxt`,
  Frequencies: `${GTFS_DOCS_BASE}#frequenciestxt`,
  Transfers: `${GTFS_DOCS_BASE}#transferstxt`,
  Translations: `${GTFS_DOCS_BASE}#translationstxt`,
  Attributions: `${GTFS_DOCS_BASE}#attributionstxt`,
  'Stops Wheelchair Accessibility': `${GTFS_DOCS_BASE}#stopstxt`,
  'Trips Wheelchair Accessibility': `${GTFS_DOCS_BASE}#tripstxt`,
  'Text-to-Speech': `${GTFS_DOCS_BASE}#stopstxt`,
  'Fare Products': `${GTFS_DOCS_BASE}#fare_productstxt`,
  'Fare Media': `${GTFS_DOCS_BASE}#fare_mediatxt`,
  'Rider Categories': `${GTFS_DOCS_BASE}#rider_categoriestxt`,
  'Route-Based Fares': `${GTFS_DOCS_BASE}#fare_rulestxt`,
  'Time-Based Fares': `${GTFS_DOCS_BASE}#fare_leg_rulestxt`,
  'Zone-Based Fares': `${GTFS_DOCS_BASE}#fare_leg_rulestxt`,
  'Fare Transfers': `${GTFS_DOCS_BASE}#fare_transfer_rulestxt`,
  'Fares V1': `${GTFS_DOCS_BASE}#fare_attributestxt`,
  'Pathway Connections': `${GTFS_DOCS_BASE}#pathwaystxt`,
  'Pathway Details': `${GTFS_DOCS_BASE}#pathwaystxt`,
  'In-Station Traversal Time': `${GTFS_DOCS_BASE}#pathwaystxt`,
  'Pathway Signs': `${GTFS_DOCS_BASE}#pathwaystxt`,
  Levels: `${GTFS_DOCS_BASE}#levelstxt`,
  'Continuous Stops': `${GTFS_DOCS_BASE}#stopstxt`,
  'Booking Rules': `${GTFS_DOCS_BASE}#booking_rulestxt`,
  'Predefined Routes with Deviation': `${GTFS_DOCS_BASE}#stop_timestxt`,
  'Zone-based Demand Responsive Services': `${GTFS_DOCS_BASE}#locationstxt`,
  'Fixed-Stops Demand Responsive Services': `${GTFS_DOCS_BASE}#stop_timestxt`,
};

// RFC-4180 compliant CSV parser handling quoted fields with embedded commas/newlines
function parseCSVText(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inQ) {
      if (c === '"' && n === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQ = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQ = true;
      } else if (c === ',') {
        row.push(field.trim());
        field = '';
      } else if (c === '\r' && n === '\n') {
        row.push(field.trim());
        if (row.some((v) => v)) rows.push(row);
        row = [];
        field = '';
        i++;
      } else if (c === '\n' || c === '\r') {
        row.push(field.trim());
        if (row.some((v) => v)) rows.push(row);
        row = [];
        field = '';
      } else {
        field += c;
      }
    }
  }
  row.push(field.trim());
  if (row.some((v) => v)) rows.push(row);

  if (rows.length === 0) return [];
  const headers = rows[0];
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] ?? '';
    });
    return obj;
  });
}

function formatConsumerName(id: string): string {
  const names: Record<string, string> = {
    google: 'Google',
    transitapp: 'Transit',
    motis: 'Motis',
    opentripplanner: 'OpenTripPlanner',
    aubin: 'Aubin',
  };
  return names[id.toLowerCase()] ?? id;
}

async function fetchCsvText(url: string): Promise<string> {
  const response = await fetch(url, { next: { revalidate: 3600 } });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch tracker CSV from ${url}: ${response.status} ${response.statusText}`,
    );
  }

  return response.text();
}

export async function fetchTrackerData(): Promise<TrackerData> {
  try {
    const [featuresText, categoriesText, fieldsText] = await Promise.all([
      fetchCsvText(CSV_URL),
      fetchCsvText(CATEGORIES_CSV_URL),
      fetchCsvText(FIELDS_CSV_URL),
    ]);

    // Parse known GTFS field names
    const fieldsRows = parseCSVText(fieldsText);
    const knownFields = Array.from(
      new Set(fieldsRows.map((r) => r.field_name?.trim()).filter(Boolean)),
    );

    // Parse categories → consumers with types and dates
    const categoriesRows = parseCSVText(categoriesText);
    const consumerDates: Record<string, string> = {};
    const consumerTypes: Record<string, string> = {};
    for (const row of categoriesRows) {
      const c = (row.consumer ?? '').trim();
      if (!c) continue;
      const key = c.toLowerCase().replace(/\s+/g, '');
      consumerTypes[key] = (row.type ?? '').trim();
      consumerDates[key] = (row.last_update ?? '').trim();
    }

    // Parse features CSV — header driven
    const featureRows = parseCSVText(featuresText);
    if (featureRows.length === 0) {
      return { features: [], consumers: [], knownFields };
    }

    // Extract consumer IDs from header columns (pattern: {id}_use)
    const headers = Object.keys(featureRows[0]);
    const consumerIds = headers
      .filter((h) => h.endsWith('_use'))
      .map((h) => h.replace('_use', ''));

    // Build consumer list preserving CSV column order
    const consumers: Consumer[] = consumerIds.map((id) => {
      const key = id.toLowerCase().replace(/\s+/g, '');
      return {
        id,
        name: formatConsumerName(id),
        type: consumerTypes[key] ?? '',
        lastUpdate: consumerDates[key] ?? '',
      };
    });

    const features: Feature[] = featureRows.map((row) => {
      const support: Record<string, FeatureSupport> = {};
      for (const cId of consumerIds) {
        const cLow = cId.toLowerCase();
        support[cId] = {
          rawStatus: (row[`${cId}_use`] ?? row[`${cLow}_use`] ?? '').trim(),
          details: (row[`${cId}_details`] ?? row[`${cLow}_details`] ?? '').trim(),
        };
      }
      return {
        name: row.Feature ?? '',
        category: row.Type ?? 'Other',
        description: row.Description ?? '',
        documentationUrl: DOCS_URL_MAP[row.Feature ?? ''] ?? null,
        support,
      };
    });

    return { features, consumers, knownFields };
  } catch (error) {
    console.error('Failed to fetch GTFS feature tracker data', error);
    return { features: [], consumers: [], knownFields: [] };
  }
}
