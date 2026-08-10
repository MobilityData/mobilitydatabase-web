// Fake summit-attendee data for the WorldGlobeSummit visualization.
//
// Each attendee belongs to a real-world transit agency (name, country ISO2,
// municipality, website domain). The domain drives the agency logo fetched
// from logo.dev — see `logoUrlForDomain`. The list of ~100 attendees is
// generated deterministically from name pools + the agency catalogue so the
// map is stable across reloads (no Math.random at module load).

export interface SummitAgency {
  agency: string;
  iso2: string;
  municipality: string;
  domain: string;
}

export interface SummitAttendee {
  id: number;
  name: string;
  iso2: string;
  municipality: string;
  agency: string;
  domain: string;
}

// logo.dev publishable token. Replace with your own from https://logo.dev.
// A missing/invalid token simply falls back to an initials avatar in the UI.
export const LOGO_DEV_TOKEN = 'pk_Xvlsj70AS1avrlpkWCmSLA';

export function logoUrlForDomain(domain: string): string {
  return `https://img.logo.dev/${domain}?token=${LOGO_DEV_TOKEN}&size=96&format=png`;
}

// Real transit agencies with their home municipality + website domain.
const AGENCIES: SummitAgency[] = [
  { agency: 'MTA', iso2: 'US', municipality: 'New York', domain: 'mta.info' },
  {
    agency: 'BART',
    iso2: 'US',
    municipality: 'San Francisco',
    domain: 'bart.gov',
  },
  {
    agency: 'WMATA',
    iso2: 'US',
    municipality: 'Washington, D.C.',
    domain: 'wmata.com',
  },
  {
    agency: 'CTA',
    iso2: 'US',
    municipality: 'Chicago',
    domain: 'transitchicago.com',
  },
  {
    agency: 'LA Metro',
    iso2: 'US',
    municipality: 'Los Angeles',
    domain: 'metro.net',
  },
  { agency: 'MBTA', iso2: 'US', municipality: 'Boston', domain: 'mbta.com' },
  {
    agency: 'SEPTA',
    iso2: 'US',
    municipality: 'Philadelphia',
    domain: 'septa.org',
  },
  {
    agency: 'TriMet',
    iso2: 'US',
    municipality: 'Portland',
    domain: 'trimet.org',
  },
  { agency: 'TfL', iso2: 'GB', municipality: 'London', domain: 'tfl.gov.uk' },
  { agency: 'STM', iso2: 'CA', municipality: 'Montréal', domain: 'stm.info' },
  { agency: 'TTC', iso2: 'CA', municipality: 'Toronto', domain: 'ttc.ca' },
  {
    agency: 'TransLink',
    iso2: 'CA',
    municipality: 'Vancouver',
    domain: 'translink.ca',
  },
  { agency: 'RATP', iso2: 'FR', municipality: 'Paris', domain: 'ratp.fr' },
  { agency: 'SNCF', iso2: 'FR', municipality: 'Paris', domain: 'sncf.com' },
  { agency: 'BVG', iso2: 'DE', municipality: 'Berlin', domain: 'bvg.de' },
  {
    agency: 'Deutsche Bahn',
    iso2: 'DE',
    municipality: 'Frankfurt',
    domain: 'bahn.de',
  },
  { agency: 'MVG', iso2: 'DE', municipality: 'Munich', domain: 'mvg.de' },
  { agency: 'SBB', iso2: 'CH', municipality: 'Bern', domain: 'sbb.ch' },
  { agency: 'NS', iso2: 'NL', municipality: 'Utrecht', domain: 'ns.nl' },
  { agency: 'GVB', iso2: 'NL', municipality: 'Amsterdam', domain: 'gvb.nl' },
  {
    agency: 'STIB',
    iso2: 'BE',
    municipality: 'Brussels',
    domain: 'stib.brussels',
  },
  { agency: 'Renfe', iso2: 'ES', municipality: 'Madrid', domain: 'renfe.com' },
  { agency: 'TMB', iso2: 'ES', municipality: 'Barcelona', domain: 'tmb.cat' },
  { agency: 'ATM', iso2: 'IT', municipality: 'Milan', domain: 'atm.it' },
  {
    agency: 'Trenitalia',
    iso2: 'IT',
    municipality: 'Rome',
    domain: 'trenitalia.com',
  },
  { agency: 'Ruter', iso2: 'NO', municipality: 'Oslo', domain: 'ruter.no' },
  { agency: 'SL', iso2: 'SE', municipality: 'Stockholm', domain: 'sl.se' },
  { agency: 'HSL', iso2: 'FI', municipality: 'Helsinki', domain: 'hsl.fi' },
  { agency: 'DSB', iso2: 'DK', municipality: 'Copenhagen', domain: 'dsb.dk' },
  {
    agency: 'ZTM Warszawa',
    iso2: 'PL',
    municipality: 'Warsaw',
    domain: 'ztm.waw.pl',
  },
  { agency: 'DPP', iso2: 'CZ', municipality: 'Prague', domain: 'dpp.cz' },
  { agency: 'BKK', iso2: 'HU', municipality: 'Budapest', domain: 'bkk.hu' },
  {
    agency: 'Wiener Linien',
    iso2: 'AT',
    municipality: 'Vienna',
    domain: 'wienerlinien.at',
  },
  {
    agency: 'JR East',
    iso2: 'JP',
    municipality: 'Tokyo',
    domain: 'jreast.co.jp',
  },
  {
    agency: 'Tokyo Metro',
    iso2: 'JP',
    municipality: 'Tokyo',
    domain: 'tokyometro.jp',
  },
  {
    agency: 'Transport for NSW',
    iso2: 'AU',
    municipality: 'Sydney',
    domain: 'transportnsw.info',
  },
  {
    agency: 'PTV',
    iso2: 'AU',
    municipality: 'Melbourne',
    domain: 'ptv.vic.gov.au',
  },
  {
    agency: 'Auckland Transport',
    iso2: 'NZ',
    municipality: 'Auckland',
    domain: 'at.govt.nz',
  },
  {
    agency: 'Metrô de São Paulo',
    iso2: 'BR',
    municipality: 'São Paulo',
    domain: 'metro.sp.gov.br',
  },
  {
    agency: 'Metro CDMX',
    iso2: 'MX',
    municipality: 'Mexico City',
    domain: 'metro.cdmx.gob.mx',
  },
  {
    agency: 'RED Movilidad',
    iso2: 'CL',
    municipality: 'Santiago',
    domain: 'red.cl',
  },
  {
    agency: 'SMRT',
    iso2: 'SG',
    municipality: 'Singapore',
    domain: 'smrt.com.sg',
  },
  {
    agency: 'Metro de Madrid',
    iso2: 'ES',
    municipality: 'Madrid',
    domain: 'metromadrid.es',
  },
  {
    agency: 'RTD Denver',
    iso2: 'US',
    municipality: 'Denver',
    domain: 'rtd-denver.com',
  },
  {
    agency: 'OC Transpo',
    iso2: 'CA',
    municipality: 'Ottawa',
    domain: 'octranspo.com',
  },
];

const FIRST_NAMES = [
  'Alex',
  'Maria',
  'Kenji',
  'Sofia',
  'Liam',
  'Amara',
  'Noah',
  'Priya',
  'Lucas',
  'Elena',
  'Mateo',
  'Yuki',
  'Omar',
  'Chloe',
  'Ravi',
  'Ingrid',
  'Diego',
  'Aisha',
  'Hugo',
  'Nina',
  'Tariq',
  'Freya',
  'Samuel',
  'Léa',
  'Marco',
  'Zara',
  'Oliver',
  'Mei',
  'Andre',
  'Kaia',
  'Felix',
  'Rosa',
  'Jonas',
  'Ana',
  'Kwame',
  'Sara',
  'Viktor',
  'Lucia',
  'Hana',
  'Ivan',
];

const LAST_NAMES = [
  'Nguyen',
  'Garcia',
  'Tanaka',
  'Rossi',
  'Kowalski',
  'Okafor',
  'Smith',
  'Patel',
  'Silva',
  'Müller',
  'Dubois',
  'Andersen',
  'Kim',
  'Costa',
  'Novak',
  'Haddad',
  'Johansson',
  'Rivera',
  'Weber',
  'Popescu',
  'Fernandez',
  'Yilmaz',
  'Bergström',
  'Moreau',
  'Bianchi',
  'Ali',
  'Wright',
  'Chen',
  'Santos',
  'Larsen',
  'Fischer',
  'Reyes',
  'Horvath',
  'Diaz',
  'Mensah',
  'Lindqvist',
  'Petrov',
  'Romano',
  'Sato',
  'Ivanov',
];

// Deterministic ~100-attendee list generated from the pools above.
function generateAttendees(count: number): SummitAttendee[] {
  const attendees: SummitAttendee[] = [];
  for (let i = 0; i < count; i++) {
    const agency = AGENCIES[i % AGENCIES.length];
    const first = FIRST_NAMES[(i * 7) % FIRST_NAMES.length];
    const last = LAST_NAMES[(i * 13) % LAST_NAMES.length];
    attendees.push({
      id: i,
      name: `${first} ${last}`,
      iso2: agency.iso2,
      municipality: agency.municipality,
      agency: agency.agency,
      domain: agency.domain,
    });
  }
  return attendees;
}

export const SUMMIT_ATTENDEES: SummitAttendee[] = generateAttendees(100);

// ISO2 -> attendees, for fast lookup on country click.
export const ATTENDEES_BY_COUNTRY: Record<string, SummitAttendee[]> =
  SUMMIT_ATTENDEES.reduce<Record<string, SummitAttendee[]>>((acc, a) => {
    (acc[a.iso2] ??= []).push(a);
    return acc;
  }, {});

// Set of countries that have at least one attendee (drives map shading).
export const SUMMIT_COUNTRIES: Set<string> = new Set(
  Object.keys(ATTENDEES_BY_COUNTRY),
);
