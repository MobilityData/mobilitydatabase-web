import { redirect } from 'next/navigation';

/**
 * Redirects /feeds/gbfs to /feeds?gbfs=true
 */
export default function GbfsFeedsRedirect(): void {
  redirect('/feeds?gbfs=true');
}
