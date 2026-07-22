import {
  type StrictEffect,
  call,
  takeLatest,
  put,
  select,
} from 'redux-saga/effects';
import {
  type ProfileError,
  USER_PROFILE_REFRESH_INFORMATION,
  USER_PROFILE_SAVE_USER_PROFILE,
  USER_REQUEST_REFRESH_ACCESS_TOKEN,
  type User,
  type UserData,
} from '../../types';
import { generateUserAccessToken, updateUserInformation, retrieveUserInformation } from '../../services';
import { applyUserFeatureFlags } from '../../services/session-service';
import {
  refreshAccessToken,
  refreshAccessTokenFail,
  refreshUserInformationFail,
  refreshUserInformationSuccess,
  saveUserProfileFail,
  saveUserProfileSuccess,
} from '../profile-reducer';
import { getAppError } from '../../utils/error';
import { selectUserProfile } from '../profile-selectors';

function* refreshAccessTokenSaga(): Generator {
  try {
    const currentUser = yield select(selectUserProfile);
    const user = yield call(generateUserAccessToken, currentUser);
    if (user !== null) {
      yield put(refreshAccessToken(user));
    }
  } catch (error) {
    yield put(refreshAccessTokenFail(getAppError(error) as ProfileError));
    return;
  }
  
  try {
    // Ideal to have endpoint dedicated to feature flags, but for now we can reuse the user profile endpoint.
    const userData: UserData | undefined = (yield call(retrieveUserInformation));
    if (userData != null) {
      yield call(applyUserFeatureFlags, userData.features);
    }
  } catch {
    // Intentionally swallowed — feature flag refresh is non-critical.
  }
}

function* refreshUserInformation(): Generator<StrictEffect, void, User> {
  try {
    const user = yield select(selectUserProfile);
    if (user?.fullName !== undefined) {
      yield call(async () => {
        await updateUserInformation({
          fullName: user.fullName,
          organization: user.organization,
          isRegisteredToReceiveAPIAnnouncements:
            user.isRegisteredToReceiveAPIAnnouncements,
        });
      });
      yield put(refreshUserInformationSuccess());
    }
  } catch (error) {
    yield put(refreshUserInformationFail(getAppError(error) as ProfileError));
  }
}

interface SaveUserProfileAction {
  type: string;
  payload: {
    fullName: string;
    organization: string;
    isRegisteredToReceiveAPIAnnouncements: boolean;
  };
}

function* saveUserProfileSaga(
  action: SaveUserProfileAction,
): Generator<StrictEffect, void, void> {
  try {
    yield call(async () => {
      await updateUserInformation(action.payload);
    });
    yield put(saveUserProfileSuccess(action.payload));
  } catch (error) {
    yield put(saveUserProfileFail(getAppError(error) as ProfileError));
  }
}

export function* watchProfile(): Generator {
  yield takeLatest(USER_REQUEST_REFRESH_ACCESS_TOKEN, refreshAccessTokenSaga);
  yield takeLatest(USER_PROFILE_REFRESH_INFORMATION, refreshUserInformation);
  yield takeLatest(USER_PROFILE_SAVE_USER_PROFILE, saveUserProfileSaga);
}
