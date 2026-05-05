import { all } from 'redux-saga/effects';
import { watchAuth } from './auth-saga';
import { watchProfile } from './profile-saga';
import { watchGTFSFetchFeedMetrics } from './gtfs-analytics-saga';
import { watchGBFSFetchFeedMetrics } from './gbfs-analytics-saga';
import { watchGbfsValidator } from './gbfs-validator-saga';
import { watchLicense } from './license-saga';

const rootSaga = function* (): Generator {
  yield all([
    watchAuth(),
    watchProfile(),
    watchGTFSFetchFeedMetrics(),
    watchGBFSFetchFeedMetrics(),
    watchGbfsValidator(),
    watchLicense(),
  ]);
};

export default rootSaga;
