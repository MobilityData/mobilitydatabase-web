'use client';

import { useTranslations } from 'next-intl';
import BreadcrumbNavigation, {
  type Crumb,
} from '../../../components/BreadcrumbNavigation';

interface Props {
  feedDataType: string;
  feedId: string;
  /**
   * Breadcrumb leaf for feed sub-pages. When set, the feed id becomes a link
   * back to the feed detail page and this label is appended after it.
   */
  currentPageLabel?: string;
  /** Where the back button goes when there is no history to pop. */
  backFallbackHref?: string;
}

export default function FeedNavigationControls({
  feedDataType,
  feedId,
  currentPageLabel,
  backFallbackHref = '/feeds',
}: Props): React.ReactElement {
  const t = useTranslations('common');

  const feedIdLabel =
    feedDataType === 'gbfs' ? feedId?.replace('gbfs-', '') : feedId;

  const crumbs: Crumb[] = [
    { label: t('feeds'), href: '/feeds' },
    { label: t(`${feedDataType}`), href: `/feeds?${feedDataType}=true` },
    currentPageLabel != undefined
      ? { label: feedIdLabel, href: `/feeds/${feedDataType}/${feedId}` }
      : { label: feedIdLabel },
  ];

  if (currentPageLabel != undefined) {
    crumbs.push({ label: currentPageLabel });
  }

  return (
    <BreadcrumbNavigation crumbs={crumbs} backFallbackHref={backFallbackHref} />
  );
}
