export interface TokenBase {
  start: number;
  end: number;
}

export interface MdLinkToken extends TokenBase {
  type: 'mdlink';
  label: string;
  url: string;
}

export interface UrlToken extends TokenBase {
  type: 'url';
  value: string;
}

export interface FileToken extends TokenBase {
  type: 'file';
  value: string;
}

export interface FieldToken extends TokenBase {
  type: 'field';
  value: string;
}

export interface TextToken {
  type: 'text';
  value: string;
}

export type Token = MdLinkToken | UrlToken | FileToken | FieldToken | TextToken;

export interface GtfsFeatureTrackerProps {
  features: Feature[];
  consumers: Consumer[];
  knownFields: string[];
}

export interface Consumer {
  id: string;
  name: string;
  type: string;
  lastUpdate: string;
}

export interface FeatureSupport {
  /** Raw status from CSV (e.g. "YES - for every feed", "Some fields are ignored") */
  rawStatus: string;
  details: string;
}

export interface Feature {
  name: string;
  category: string;
  description: string;
  documentationUrl: string | null;
  support: Record<string, FeatureSupport>;
}

export interface TrackerData {
  features: Feature[];
  consumers: Consumer[];
  knownFields: string[];
}
