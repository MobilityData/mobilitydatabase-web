import { redirect } from 'next/navigation';

/**
 * Redirects /feeds/gtfs to /feeds?gtfs=true
 */
export default function GtfsFeedsRedirect(): void {
  redirect('/feeds?gtfs=true');
}
