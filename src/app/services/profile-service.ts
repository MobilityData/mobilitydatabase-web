import { type AdditionalUserInfo } from 'firebase/auth';
import { app } from '../../firebase';
import { type User, type UserData } from '../types';
import createClient from 'openapi-fetch';
import type { paths } from './user-service-api-types';
import { generateAuthMiddlewareWithToken } from './api-auth-middleware';

const userServiceClient = createClient<paths>({
  baseUrl: String(process.env.NEXT_PUBLIC_FEED_API_BASE_URL),
});

/**
 * Send an email verification to the current user.
 */
export const sendEmailVerification = async (): Promise<void> => {
  const user = app.auth().currentUser;
  if (user !== null && !user.emailVerified) {
    await user.sendEmailVerification();
  }
};

/**
 * Return the current user or null if the user is not logged in.
 */
export const getUserFromSession = async (): Promise<User | null> => {
  const currentUser = app.auth().currentUser;
  if (currentUser === null) {
    return null;
  }
  const refreshToken = currentUser.refreshToken;
  return {
    fullName: currentUser?.displayName ?? undefined,
    email: currentUser?.email ?? '',
    isRegistered: false,
    isEmailVerified: currentUser?.emailVerified ?? false,
    // Organization cannot be retrieved from the current user
    organization: undefined,
    isRegisteredToReceiveAPIAnnouncements: false,
    isAnonymous: currentUser.isAnonymous,
    refreshToken,
  };
};

/**
 * Retrieve the current Firebase user's Access token.
 * If the access token is expired, this function will refresh it and return it.
 * If the access token is not available, an error is thrown.
 */
export async function getUserAccessToken(): Promise<string> {
  const currentUser = app.auth().currentUser;

  if (currentUser === null) {
    throw new Error('Cannot retrieve access token');
  }
  const idTokenResult = await currentUser.getIdTokenResult();

  return idTokenResult.token;
}

export const generateUserAccessToken = async (
  user: User,
): Promise<User | null> => {
  const currentUser = app.auth().currentUser;

  if (currentUser === null) {
    return null;
  }
  const refreshToken = currentUser.refreshToken;
  const idTokenResult = await currentUser.getIdTokenResult(true);
  const accessToken = idTokenResult.token;
  const accessTokenExpirationTime = idTokenResult.expirationTime;

  return {
    ...user,
    refreshToken,
    accessToken,
    accessTokenExpirationTime,
  };
};

export const updateUserInformation = async (data: {
  fullName: string | undefined;
  organization: string | undefined;
  isRegisteredToReceiveAPIAnnouncements: boolean;
}): Promise<void> => {
  const accessToken = await getUserAccessToken();
  const authMiddleware = generateAuthMiddlewareWithToken(accessToken);
  userServiceClient.use(authMiddleware);
  try {
    await userServiceClient.PUT('/v1/user', {
      body: {
        full_name: data.fullName ?? null,
        legacy_org_name: data.organization ?? null,
        is_registered_to_receive_api_announcements:
          data.isRegisteredToReceiveAPIAnnouncements,
      },
    });
  } finally {
    userServiceClient.eject(authMiddleware);
  }
};

export const retrieveUserInformation = async (): Promise<
  UserData | undefined
> => {
  const accessToken = await getUserAccessToken();
  const authMiddleware = generateAuthMiddlewareWithToken(accessToken);
  userServiceClient.use(authMiddleware);
  try {
    const { data } = await userServiceClient.GET('/v1/user');
    if (data === undefined) {
      return undefined;
    }
    console.log('User information retrieved from the API', data);
    return {
      fullName: data.full_name ?? '',
      organization: data.legacy_org_name ?? undefined,
      isRegisteredToReceiveAPIAnnouncements:
        data.is_registered_to_receive_api_announcements,
    };
  } finally {
    userServiceClient.eject(authMiddleware);
  }
};

export const populateUserWithAdditionalInfo = (
  user: User,
  userData: UserData | undefined,
  additionalUserInfo: AdditionalUserInfo | undefined,
): User => {
  return {
    ...user,
    isRegistered: userData !== null,
    fullName:
      userData?.fullName ??
      (additionalUserInfo?.profile?.name as string) ??
      undefined,
    organization: userData?.organization ?? undefined,
    email:
      user?.email ??
      (additionalUserInfo?.profile?.email as string) ??
      undefined,
    isRegisteredToReceiveAPIAnnouncements:
      userData?.isRegisteredToReceiveAPIAnnouncements ?? false,
  };
};
