export interface NotificationTypeDefinition {
  /** Notification type id, matches `NotificationSubscription.notification_id` from the API. */
  id: string;
  /** i18n key (under the 'feeds' namespace) for the type's display label. */
  labelKey: string;
  /** i18n key (under the 'feeds' namespace) for the type's tooltip/description. */
  tooltipKey: string;
  /** Whether this type is scoped to a specific feed (subscribable per-feed) vs. a global type like announcements. */
  feedScoped: boolean;
}

export const NOTIFICATION_TYPES: NotificationTypeDefinition[] = [
  {
    id: 'feed.url_updated',
    labelKey: 'feedUrlUpdatedLabel',
    tooltipKey: 'feedUrlUpdatedTooltip',
    feedScoped: true,
  },
  // {
  //   id: 'feed.url_availability',
  //   labelKey: 'feedUrlAvailabilityLabel',
  //   tooltipKey: 'feedUrlAvailabilityTooltip',
  //   feedScoped: true,
  // },
  // {
  //   id: 'feed.coverage',
  //   labelKey: 'feedCoverageLabel',
  //   tooltipKey: 'feedCoverageTooltip',
  //   feedScoped: true,
  // },
  {
    id: 'api.announcements',
    labelKey: 'apiAnnouncementsLabel',
    tooltipKey: 'apiAnnouncementsTooltip',
    feedScoped: false,
  },
];

export const FEED_NOTIFICATION_TYPES = NOTIFICATION_TYPES.filter(
  (type) => type.feedScoped,
);

export const FEED_NOTIFICATION_TYPE_IDS = FEED_NOTIFICATION_TYPES.map(
  (type) => type.id,
);
