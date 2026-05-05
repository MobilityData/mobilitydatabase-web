import { combineReducers } from 'redux';
import profileReducer from './profile-reducer';
import GTFSAnalyticsReducer from './gtfs-analytics-reducer';
import GBFSAnalyticsReducer from './gbfs-analytics-reducer';
import gbfsValidatorReducer from './gbfs-validator-reducer';
import licenseReducer from './license-reducer';

const rootReducer = combineReducers({
  userProfile: profileReducer,
  gtfsAnalytics: GTFSAnalyticsReducer,
  gbfsAnalytics: GBFSAnalyticsReducer,
  gbfsValidator: gbfsValidatorReducer,
  licenseProfile: licenseReducer,
});

export default rootReducer;
