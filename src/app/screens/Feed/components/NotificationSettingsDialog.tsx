'use client';

// This component is subject to change based on the actual notification settings we want to offer and the APIs available to save them. For now it's a mockup of what the UI could look like.

import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import FormLabel from '@mui/material/FormLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ChangeTypeInfoPopover, {
  CHANGE_TYPE_INFO,
} from '../../../components/ChangeTypeInfoPopover';

export interface NotificationSettings {
  frequency: 'onChange' | 'weekly' | 'monthly' | 'quarterly';
  changeTypes: string[];
}

export const defaultNotificationSettings: NotificationSettings = {
  frequency: 'onChange',
  changeTypes: [
    'any',
    'features',
    'expiry',
    'validation',
    'breaking',
    'suspicious',
  ],
};

const CHANGE_TYPE_OPTIONS = [
  { value: 'any', label: 'All Changes' },
  { value: 'features', label: 'Features Changes' },
  { value: 'expiry', label: '7 Days Before Expiry' },
  { value: 'validation', label: 'New Validation Errors' },
  { value: 'breaking', label: 'Breaking Changes' },
  { value: 'suspicious', label: 'Suspicious Changes' },
] as const;

const SPECIFIC_TYPES = [
  'features',
  'expiry',
  'validation',
  'breaking',
  'suspicious',
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (settings: NotificationSettings) => void;
  initialSettings: NotificationSettings;
}

export default function NotificationSettingsDialog({
  open,
  onClose,
  onSave,
  initialSettings,
}: Props): React.ReactElement {
  const [frequency, setFrequency] = useState(initialSettings.frequency);
  const [changeTypes, setChangeTypes] = useState<string[]>(
    initialSettings.changeTypes,
  );
  const [infoPopover, setInfoPopover] = useState<{
    anchor: HTMLElement;
    type: string;
  } | null>(null);

  // Reset to saved settings each time the dialog opens
  useEffect(() => {
    if (open) {
      setFrequency(initialSettings.frequency);
      setChangeTypes(initialSettings.changeTypes);
      setInfoPopover(null);
    }
  }, [open, initialSettings]);

  const handleChangeTypeToggle = (value: string): void => {
    if (value === 'any') {
      setChangeTypes(
        changeTypes.includes('any') ? [] : ['any', ...SPECIFIC_TYPES],
      );
    } else {
      if (changeTypes.includes(value)) {
        // Remove the type and "any" (partial selection invalidates "any")
        setChangeTypes(changeTypes.filter((t) => t !== value && t !== 'any'));
      } else {
        const withNew = changeTypes.filter((t) => t !== 'any').concat(value);
        // Auto-select "any" when all specific types are checked
        const allSpecificSelected = SPECIFIC_TYPES.every((t) =>
          withNew.includes(t),
        );
        setChangeTypes(allSpecificSelected ? ['any', ...withNew] : withNew);
      }
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>Global Notification Settings</DialogTitle>

      <DialogContent dividers>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Frequency */}
          <FormControl>
            <FormLabel sx={{ fontWeight: 500, mb: 0.5 }}>
              Frequency of Notification
            </FormLabel>
            <Select
              value={frequency}
              onChange={(e) => {
                setFrequency(e.target.value);
              }}
              size='small'
            >
              <MenuItem value='onChange'>Anytime the feed changes</MenuItem>
              <MenuItem value='weekly'>Once a week</MenuItem>
              <MenuItem value='monthly'>Once a month</MenuItem>
              <MenuItem value='quarterly'>Once every 3 months</MenuItem>
            </Select>
          </FormControl>

          {/* Type of changes */}
          <FormControl component='fieldset'>
            <FormLabel component='legend' sx={{ fontWeight: 500, mb: 0.5 }}>
              Type of Changes
            </FormLabel>
            <FormGroup>
              {CHANGE_TYPE_OPTIONS.map(({ value, label }) => (
                <FormControlLabel
                  key={value}
                  control={
                    <Checkbox
                      checked={changeTypes.includes(value)}
                      onChange={() => {
                        handleChangeTypeToggle(value);
                      }}
                    />
                  }
                  label={
                    value in CHANGE_TYPE_INFO ? (
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <span>{label}</span>
                        <IconButton
                          size='small'
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setInfoPopover({
                              anchor: e.currentTarget,
                              type: value,
                            });
                          }}
                          sx={{ ml: 0.5 }}
                          aria-label={`About ${label}`}
                        >
                          <InfoOutlinedIcon fontSize='small' />
                        </IconButton>
                      </Box>
                    ) : (
                      label
                    )
                  }
                />
              ))}
            </FormGroup>
          </FormControl>
        </Box>
      </DialogContent>

      {infoPopover != null && (
        <ChangeTypeInfoPopover
          anchor={infoPopover.anchor}
          type={infoPopover.type}
          onClose={() => {
            setInfoPopover(null);
          }}
        />
      )}

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant='contained'
          disableElevation
          onClick={() => {
            onSave({ frequency, changeTypes });
          }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
