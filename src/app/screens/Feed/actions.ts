'use server';
import {
  getCurrentUserFromCookie,
  isMobilityDatabaseAdmin,
} from '../../utils/auth-server';
import { revalidateSpecificFeeds } from '../../utils/revalidate-feeds';

export async function revalidateFeedCache(
  feedId: string,
): Promise<{ ok: boolean; message: string }> {
  const user = await getCurrentUserFromCookie();
  if (!isMobilityDatabaseAdmin(user?.email)) {
    return { ok: false, message: 'Unauthorized: admin access required' };
  }

  revalidateSpecificFeeds([feedId]);
  return { ok: true, message: `Cache revalidated for feed ${feedId}` };
}
