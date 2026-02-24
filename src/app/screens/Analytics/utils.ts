/**
 * Global analytics bucket endpoint storage and access
 */
let globalAnalyticsBucketEndpoint: string | undefined;

export const getAnalyticsBucketEndpoint = (): string | undefined =>
  globalAnalyticsBucketEndpoint;

export const setAnalyticsBucketEndpoint = (
  endpoint: string | undefined,
): void => {
  globalAnalyticsBucketEndpoint = endpoint;
};
