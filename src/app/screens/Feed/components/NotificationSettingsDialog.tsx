'use client';

import { useState, useEffect } from 'react';
import { useSWRConfig } from 'swr';
import useSWRMutation from 'swr/mutation';
import { useTranslations } from 'next-intl';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import FormLabel from '@mui/material/FormLabel';
import Tooltip from '@mui/material/Tooltip';
import {
  createUserSubscription,
  type NotificationSubscription,
  removeFeedsFromUserSubscription,
  USER_SUBSCRIPTIONS_SWR_KEY,
} from '../../../services/notification-service';
import { settleAll } from '../../../utils/subscriptionCache';
import {
  FEED_NOTIFICATION_TYPE_IDS,
  FEED_NOTIFICATION_TYPES,
} from '../../../utils/notificationTypes';

export interface NotificationSettings {
  changeTypes: string[];
}

export const defaultNotificationSettings: NotificationSettings = {
  changeTypes: FEED_NOTIFICATION_TYPE_IDS,
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (settings: NotificationSettings) => void;
  initialSettings: NotificationSettings;
  feedId?: string;
  existingSubscriptions?: NotificationSubscription[];
}

export default function NotificationSettingsDialog({
  open,
  onClose,
  onSave,
  initialSettings,
  feedId,
  existingSubscriptions = [],
}: Props): React.ReactElement {
  const t = useTranslations('feeds');
  const { mutate } = useSWRConfig();
  const [changeTypes, setChangeTypes] = useState<string[]>(
    initialSettings.changeTypes,
  );

  interface SettingsChange {
    addedTypes: string[];
    removedTypes: string[];
  }

  const {
    trigger: applySettingsChange,
    isMutating: isSaving,
    error: saveError,
    reset: resetSaveError,
  } = useSWRMutation(
    ['notification-settings', feedId ?? ''],
    async (_key, { arg }: { arg: SettingsChange }): Promise<void> => {
      try {
        await settleAll<unknown>([
          ...arg.addedTypes.map(
            async (notificationId) =>
              await createUserSubscription({
                notification_id: notificationId,
                feed_ids: [feedId as string],
              }),
          ),
          // The type's subscription is shared with the user's other feeds, so
          // remove only this feed from it rather than deleting it.
          ...arg.removedTypes.map(async (notificationId) => {
            const subscription = existingSubscriptions.find(
              (s) => s.notification_id === notificationId,
            );
            if (subscription !== undefined) {
              await removeFeedsFromUserSubscription(subscription.id, [
                feedId as string,
              ]);
            }
          }),
        ]);
      } finally {
        // Resync even after a partial failure, so the cache reflects the
        // requests that did succeed. This is the global notification key.
        void mutate(USER_SUBSCRIPTIONS_SWR_KEY);
      }
    },
  );

  // Reset to saved settings each time the dialog opens
  useEffect(() => {
    if (open) {
      setChangeTypes(initialSettings.changeTypes);
      resetSaveError();
    }
  }, [open, initialSettings, resetSaveError]);

  const handleChangeTypeToggle = (value: string): void => {
    setChangeTypes((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value],
    );
  };

  const handleSave = (): void => {
    if (feedId === undefined || feedId === '') {
      onSave({ changeTypes });
      return;
    }

    const addedTypes = FEED_NOTIFICATION_TYPE_IDS.filter(
      (type) =>
        changeTypes.includes(type) &&
        !initialSettings.changeTypes.includes(type),
    );
    const removedTypes = FEED_NOTIFICATION_TYPE_IDS.filter(
      (type) =>
        !changeTypes.includes(type) &&
        initialSettings.changeTypes.includes(type),
    );

    if (addedTypes.length === 0 && removedTypes.length === 0) {
      onSave({ changeTypes });
      return;
    }

    applySettingsChange({ addedTypes, removedTypes })
      .then(() => {
        onSave({ changeTypes });
      })
      .catch(() => {
        // Already captured in `saveError` and rendered above.
      });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>Notification Settings</DialogTitle>

      <DialogContent dividers>
        {saveError && (
          <Alert severity='error' sx={{ mb: 2 }}>
            Failed to update notification settings. Please try again.
          </Alert>
        )}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Type of changes */}
          <FormControl component='fieldset'>
            <FormLabel component='legend' sx={{ fontWeight: 500, mb: 0.5 }}>
              Type of Changes
            </FormLabel>
            <FormGroup>
              {FEED_NOTIFICATION_TYPES.map((type) => (
                <FormControlLabel
                  key={type.id}
                  control={
                    <Checkbox
                      checked={changeTypes.includes(type.id)}
                      disabled={isSaving}
                      onChange={() => {
                        handleChangeTypeToggle(type.id);
                      }}
                    />
                  }
                  label={
                    <Tooltip title={t(type.tooltipKey)} placement='right'>
                      <span>{t(type.labelKey)}</span>
                    </Tooltip>
                  }
                />
              ))}
            </FormGroup>
          </FormControl>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={isSaving}>
          Cancel
        </Button>
        <Button
          variant='contained'
          disableElevation
          onClick={handleSave}
          disabled={isSaving}
          startIcon={
            isSaving ? (
              <CircularProgress size={16} color='inherit' />
            ) : undefined
          }
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
