export type YesNoFormInput = 'yes' | 'no' | '';

export type AuthTypes =
  | 'None - 0'
  | 'API key - 1'
  | 'HTTP header - 2'
  | 'choiceRequired';

export interface FeedSubmissionFormFormInput {
  isOfficialProducer: YesNoFormInput;
  isOfficialFeed: 'yes' | 'no' | 'unsure' | undefined;
  dataType: 'gtfs' | 'gtfs_rt';
  transitProviderName: string;
  feedLink?: string;
  oldFeedLink?: string;
  isUpdatingFeed?: YesNoFormInput;
  licensePath?: string;
  country?: string;
  region?: string;
  municipality?: string;
  tripUpdates?: string;
  vehiclePositions?: string;
  serviceAlerts?: string;
  oldTripUpdates?: string;
  oldVehiclePositions?: string;
  oldServiceAlerts?: string;
  gtfsRelatedScheduleLink?: string;
  name?: string;
  authType: AuthTypes;
  authSignupLink?: string;
  authParameterName?: string;
  dataProducerEmail: string;
  isInterestedInQualityAudit: YesNoFormInput;
  userInterviewEmail?: string;
  whatToolsUsedText?: string;
  hasLogoPermission: YesNoFormInput;
  unofficialDesc?: string;
  updateFreq?: string;
  emptyLicenseUsage?: string;
}