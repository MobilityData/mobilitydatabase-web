import { redirect } from 'next/navigation';

/**
 * Redirects /feeds/gtfs_rt to /feeds?gtfs_rt=true
 */
export default function GtfsRtFeedsRedirect(): void {
  redirect('/feeds?gtfs_rt=true');
}
