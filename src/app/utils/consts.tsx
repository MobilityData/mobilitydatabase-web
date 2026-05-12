import AccessibleIcon from '@mui/icons-material/Accessible';
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus';
import EscalatorIcon from '@mui/icons-material/Escalator';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';

interface DatasetFeature {
  component: string;
  componentSubgroup?: string;
  fileNames: string[];
  linkToInfo: string;
  deprecated?: boolean;
}

type DatasetFeatures = Record<string, DatasetFeature>;

export function getDataFeatureUrl(feature: string): string {
  return (
    DATASET_FEATURES[feature]?.linkToInfo ??
    DATASET_FEATURES.overview.linkToInfo
  );
}

export interface DatasetComponentFeature extends DatasetFeature {
  feature: string;
}

interface ComprehensiveDatasetFeature extends DatasetFeature {
  color: string;
  icon: React.ReactElement;
}

export function groupFeaturesByComponent(
  features: string[] = Object.keys(DATASET_FEATURES),
  removeDeprecated = false,
): Record<string, DatasetComponentFeature[]> {
  const groupedFeatures: Record<string, DatasetComponentFeature[]> = {};

  features.forEach((feature) => {
    const featureData = DATASET_FEATURES[feature];
    if (featureData !== undefined) {
      if (removeDeprecated && featureData.deprecated === true) {
        return;
      }
      const component =
        featureData.component !== '' ? featureData.component : 'Other';
      if (groupedFeatures[component] === undefined) {
        groupedFeatures[component] = [];
      }
      groupedFeatures[component].push({ ...featureData, feature });
    }
  });
  return groupedFeatures;
}

/**
 *
 * @param feature The gtfs schedule feature
 * @returns Gets the feature data as well as the associated component data
 */
export function getFeatureComponentDecorators(
  feature: string,
): ComprehensiveDatasetFeature {
  const featureData = DATASET_FEATURES[feature] ?? {};
  const component = DATASET_FEATURES[feature]?.component ?? 'Overview';
  return { ...getComponentDecorators(component), ...featureData };
}

export function getComponentDecorators(component: string): {
  color: string;
  icon: React.ReactElement;
} {
  switch (component) {
    case 'Accessibility':
      return { color: '#BDE4A7', icon: <AccessibleIcon /> };
    case 'Base add-ons':
      return { color: '#f0f0f0', icon: <DirectionsBusIcon /> };
    case 'Fares v2':
      return { color: '#C2D6FF', icon: <MonetizationOnIcon /> };
    case 'Fares':
      return { color: '#d1e4ff', icon: <MonetizationOnIcon /> };
    case 'Pathways':
      return { color: '#fdd4e0', icon: <EscalatorIcon /> };
    case 'Flexible Services':
      return { color: '#fcb68e', icon: <AltRouteIcon /> };
    case 'Flex':
      return { color: '#FBA674', icon: <AltRouteIcon /> };
    default:
      return { color: '#f7f7f7', icon: <></> };
  }
}

export const DATASET_FEATURES: DatasetFeatures = {
  overview: {
    component: '',
    fileNames: [],
    linkToInfo: 'https://gtfs.org/getting-started/features/overview/',
  },
  'Text-to-Speech': {
    component: 'Accessibility',
    fileNames: ['stops.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/accessibility/#text-to-speech',
  },
  'Stops Wheelchair Accessibility': {
    component: 'Accessibility',
    fileNames: ['stops.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/accessibility/#stops-wheelchair-accessibility',
  },
  'Trips Wheelchair Accessibility': {
    component: 'Accessibility',
    fileNames: ['trips.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/accessibility/#trips-wheelchair-accessibility',
  },
  'Route Colors': {
    component: 'Base add-ons',
    fileNames: ['routes.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/base-add-ons/#route-colors',
  },
  'Bike Allowed': {
    component: 'Base add-ons',
    fileNames: ['trips.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/base-add-ons/#bike-allowed',
  },
  Translations: {
    component: 'Base add-ons',
    fileNames: ['translations.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/base-add-ons/#translations',
  },
  Headsigns: {
    component: 'Base add-ons',
    fileNames: ['trips.txt', 'stop_times.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/base-add-ons/#headsigns',
  },
  'Fare Products': {
    component: 'Fares',
    componentSubgroup: 'Fares v2',
    fileNames: ['fare_products.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/fares/#fare-products',
  },
  'Fare Media': {
    component: 'Fares',
    componentSubgroup: 'Fares v2',
    fileNames: ['fare_media.txt', 'fare_products.txt'],
    linkToInfo: 'https://gtfs.org/getting-started/features/fares/#fare-media',
  },
  'Rider Categories': {
    component: 'Fares',
    componentSubgroup: 'Fares v2',
    fileNames: ['rider_categories.txt', 'fare_products.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/fares/#rider-categories',
  },
  'Route-Based Fares': {
    component: 'Fares',
    componentSubgroup: 'Fares v2',
    fileNames: [
      'routes.txt',
      'networks.txt',
      'fare_products.txt',
      'fare_leg_rules.txt',
    ],
    linkToInfo:
      'https://gtfs.org/getting-started/features/fares/#route-based-fares',
  },
  'Time-Based Fares': {
    component: 'Fares',
    componentSubgroup: 'Fares v2',
    fileNames: ['timeframes.txt', 'fare_products.txt', 'fare_leg_rules.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/fares/#time-based-fares',
  },
  'Zone-Based Fares': {
    component: 'Fares',
    componentSubgroup: 'Fares v2',
    fileNames: ['areas.txt', 'fare_products.txt', 'fare_leg_rules.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/fares/#zone-based-fares',
  },
  'Fare Transfers': {
    component: 'Fares',
    componentSubgroup: 'Fares v2',
    fileNames: ['fare_transfer_rules.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/fares/#fare-transfers',
  },
  'Fares V1': {
    component: 'Fares',
    fileNames: ['fare_attributes.txt'],
    linkToInfo: 'https://gtfs.org/getting-started/features/fares/#fares-v1',
  },
  'Pathway Connections': {
    component: 'Pathways',
    fileNames: ['pathways.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/pathways/#pathway-connections',
  },
  'Pathway Details': {
    component: 'Pathways',
    fileNames: ['pathways.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/pathways/#pathway-details',
  },
  Levels: {
    component: 'Pathways',
    fileNames: ['levels.txt'],
    linkToInfo: 'https://gtfs.org/getting-started/features/pathways/#levels',
  },
  'In-station Traversal Time': {
    component: 'Pathways',
    fileNames: ['pathways.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/pathways/#in-station-traversal-time',
  },
  'Pathway Signs': {
    component: 'Pathways',
    fileNames: ['pathways.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/pathways/#pathway-signs',
  },
  'Location Types': {
    component: 'Base add-ons',
    fileNames: ['stops.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/base-add-ons/#location-types',
  },
  'Feed Information': {
    component: 'Base add-ons',
    fileNames: ['feed_info.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/base-add-ons/#feed-information',
  },
  Attributions: {
    component: 'Base add-ons',
    fileNames: ['attributions.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/base-add-ons/#attributions',
  },
  'Continuous Stops': {
    component: 'Flexible Services',
    fileNames: ['routes.txt', 'stop_times.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/flexible-services/#continuous-stops',
  },
  'Booking Rules': {
    component: 'Flexible Services',
    componentSubgroup: 'Flex',
    fileNames: ['booking_rules.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/flexible-services/#booking-rules',
  },
  'Fixed-Stops Demand Responsive Transit': {
    component: 'Flexible Services',
    componentSubgroup: 'Flex',
    fileNames: ['location_groups.txt', 'stop_times.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/flexible-services/#fixed-stops-demand-responsive-services',
  },
  'Zone-Based Demand Responsive Services': {
    component: 'Flexible Services',
    componentSubgroup: 'Flex',
    fileNames: ['stop_times.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/flexible-services/#zone-based-demand-responsive-services',
  },
  'Predefined Routes with Deviation': {
    component: 'Flexible Services',
    componentSubgroup: 'Flex',
    fileNames: ['stop_times.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/flexible-services/#predefined-routes-with-deviation',
  },
  Shapes: {
    component: 'Base add-ons',
    fileNames: ['shapes.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/base-add-ons/#shapes ',
  },
  Transfers: {
    component: 'Base add-ons',
    fileNames: ['transfers.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/base-add-ons/#transfers',
  },
  Frequencies: {
    component: 'Base add-ons',
    fileNames: ['frequencies.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/base-add-ons/#frequency-based-service ',
  },
  'Contactless EMV Support': {
    component: 'Fares',
    fileNames: ['agency.txt', 'routes.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/fares/#contactless-emv-support',
  },
  'Cars Allowed': {
    component: 'Base add-ons',
    fileNames: ['trips.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/base-add-ons/#cars-allowed',
  },
  'Stop Access': {
    component: 'Base add-ons',
    fileNames: ['stops.txt'],
    linkToInfo:
      'https://gtfs.org/getting-started/features/base-add-ons/#stop-access',
  },
};
// SPELLING CORRECTIONS
DATASET_FEATURES['Text-To-Speech'] = {
  ...DATASET_FEATURES['Text-to-Speech'],
  deprecated: true,
};

// DEPRECATED FEATURES
DATASET_FEATURES['Wheelchair Accessibility'] = {
  // as of 6.0
  component: 'Accessibility',
  fileNames: ['trips.txt'],
  linkToInfo: 'https://gtfs.org/getting-started/features/accessibility',
  deprecated: true,
};
DATASET_FEATURES['Bikes Allowance'] = {
  ...DATASET_FEATURES['Bike Allowed'],
  deprecated: true,
};
DATASET_FEATURES['Transfer Fares'] = {
  ...DATASET_FEATURES['Fare Transfers'],
  deprecated: true,
}; // as of 6.0
DATASET_FEATURES['Pathways (basic)'] = {
  ...DATASET_FEATURES['Pathway Connections'],
  deprecated: true,
}; // as of 6.0
DATASET_FEATURES['Pathways (extra)'] = {
  ...DATASET_FEATURES['Pathway Details'],
  deprecated: true,
}; // as of 6.0
DATASET_FEATURES['Traversal Time'] = {
  ...DATASET_FEATURES['In-station Traversal Time'],
  deprecated: true,
};
DATASET_FEATURES['Pathways Directions'] = {
  // as of 6.0
  component: 'Pathways',
  fileNames: ['pathways.txt'],
  linkToInfo: 'https://gtfs.org/schedule/reference/#pathwaystxt',
  deprecated: true,
};
