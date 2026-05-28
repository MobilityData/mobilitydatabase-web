'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import FormLabel from '@mui/material/FormLabel';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import NotificationSettingsDialog, {
  defaultNotificationSettings,
  type NotificationSettings,
} from '../../../screens/Feed/components/NotificationSettingsDialog';
import { AccountSectionContainer } from '../AccountSectionContainer';

interface NotificationSubscription {
  id: string;
  title: string;
  status: 'active' | 'paused';
  frequency: 'onChange' | 'weekly' | 'monthly' | 'quarterly';
  lastSent: string | null;
}

const MOCK_NOTIFICATIONS: NotificationSubscription[] = [
  {
    id: '1',
    title: 'STM – Société de transport de Montréal',
    status: 'active',
    frequency: 'weekly',
    lastSent: '2026-05-20',
  },
  {
    id: '2',
    title: 'TTC – Toronto Transit Commission',
    status: 'paused',
    frequency: 'monthly',
    lastSent: '2026-04-15',
  },
  {
    id: '3',
    title: 'MTA New York City Transit',
    status: 'active',
    frequency: 'onChange',
    lastSent: '2026-05-26',
  },
  {
    id: '4',
    title: 'OC Transpo Ottawa',
    status: 'active',
    frequency: 'quarterly',
    lastSent: null,
  },
  {
    id: '5',
    title: 'TransLink – Metro Vancouver',
    status: 'paused',
    frequency: 'weekly',
    lastSent: '2026-03-02',
  },
];

const FREQUENCY_LABELS: Record<NotificationSubscription['frequency'], string> =
  {
    onChange: 'On Change',
    weekly: 'Weekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
  };

const CHANGE_TYPE_OPTIONS = [
  { value: 'any', label: 'Any Change' },
  { value: 'features', label: 'Features Only' },
  { value: 'expiry', label: '7 Days Before Expiry' },
  { value: 'validation', label: 'New Validation Errors' },
] as const;

const SPECIFIC_TYPES = ['features', 'expiry', 'validation'];

export default function AccountNotifications(): React.ReactElement {
  const [tab, setTab] = React.useState(0);
  const [notifications, setNotifications] =
    React.useState<NotificationSubscription[]>(MOCK_NOTIFICATIONS);
  const [menuState, setMenuState] = React.useState<{
    anchor: HTMLElement;
    id: string;
  } | null>(null);
  const [settingsDialogOpen, setSettingsDialogOpen] = React.useState(false);
  const [rowSettings, setRowSettings] = React.useState<
    Record<string, NotificationSettings>
  >({});

  // Default settings state for the Settings tab
  const [defaultFrequency, setDefaultFrequency] =
    React.useState<NotificationSettings['frequency']>('onChange');
  const [defaultChangeTypes, setDefaultChangeTypes] = React.useState<string[]>(
    [],
  );

  const selectedSubscription =
    menuState !== null
      ? notifications.find((n) => n.id === menuState.id)
      : undefined;
  const isPaused = selectedSubscription?.status === 'paused';

  const handleMenuOpen = (
    event: React.MouseEvent<HTMLElement>,
    id: string,
  ): void => {
    setMenuState({ anchor: event.currentTarget, id });
  };

  const handleMenuClose = (): void => {
    setMenuState(null);
  };

  const handleTogglePause = (): void => {
    if (menuState !== null) {
      const { id } = menuState;
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id
            ? { ...n, status: n.status === 'paused' ? 'active' : 'paused' }
            : n,
        ),
      );
      handleMenuClose();
    }
  };

  const handleUnsubscribe = (): void => {
    if (menuState !== null) {
      const { id } = menuState;
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      handleMenuClose();
    }
  };

  const handleOpenSettings = (): void => {
    handleMenuClose();
    setSettingsDialogOpen(true);
  };

  const handleSaveSettings = (settings: NotificationSettings): void => {
    if (menuState !== null) {
      setRowSettings((prev) => ({ ...prev, [menuState.id]: settings }));
    }
    setSettingsDialogOpen(false);
  };

  const handleDefaultChangeTypeToggle = (value: string): void => {
    if (value === 'any') {
      setDefaultChangeTypes((prev) =>
        prev.includes('any') ? [] : ['any', ...SPECIFIC_TYPES],
      );
    } else {
      setDefaultChangeTypes((prev) => {
        if (prev.includes(value)) {
          return prev.filter((t) => t !== value && t !== 'any');
        }
        const withNew = prev.filter((t) => t !== 'any').concat(value);
        const allSpecific = SPECIFIC_TYPES.every((t) => withNew.includes(t));
        return allSpecific ? ['any', ...withNew] : withNew;
      });
    }
  };

  const selectedRowId = menuState?.id;
  const settingsInitial =
    selectedRowId !== undefined
      ? (rowSettings[selectedRowId] ?? defaultNotificationSettings)
      : defaultNotificationSettings;

  return (
    <AccountSectionContainer title='Notifications'>
      <Tabs
        value={tab}
        onChange={(_, v: number) => {
          setTab(v);
        }}
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
      >
        <Tab label='Feeds' sx={{textTransform: 'none'}}/>
        <Tab label='Settings' sx={{textTransform: 'none'}}/>
      </Tabs>

      {/* ── Feeds tab ─────────────────────────────────────────────── */}
      {tab === 0 && (
        <Box>
          <TableContainer sx={{backgroundColor: 'background.default', borderRadius: 1}}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>
                    <Typography fontWeight={600}>Title</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600}>Status</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600}>Frequency</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600}>Last Sent</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600}></Typography>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {notifications.map((n) => (
                  <TableRow key={n.id} hover>
                    <TableCell>{n.title}</TableCell>
                    <TableCell>
                      <Chip
                        label={n.status === 'active' ? 'Active' : 'Paused'}
                        color={n.status === 'active' ? 'success' : 'default'}
                        size='small'
                        variant='outlined'
                      />
                    </TableCell>
                    <TableCell>{FREQUENCY_LABELS[n.frequency]}</TableCell>
                    <TableCell>
                      {n.lastSent !== null
                        ? new Date(n.lastSent).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : '—'}
                    </TableCell>
                    <TableCell sx={{ textAlign: 'right' }}>
                      <IconButton
                        size='small'
                        aria-label={`Actions for ${n.title}`}
                        onClick={(e) => {
                          handleMenuOpen(e, n.id);
                        }}
                      >
                        <MoreVertIcon fontSize='small' />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {notifications.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align='center'>
                      <Typography color='text.secondary' sx={{ py: 4 }}>
                        No active subscriptions
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Menu
            anchorEl={menuState?.anchor}
            open={menuState !== null}
            onClose={handleMenuClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <MenuItem onClick={handleTogglePause}>
              {isPaused === true ? 'Resume Notifications' : 'Pause Notifications'}
            </MenuItem>
            <MenuItem onClick={handleUnsubscribe} sx={{ color: 'error.main' }}>
              Unsubscribe
            </MenuItem>
          </Menu>

          <NotificationSettingsDialog
            open={settingsDialogOpen}
            onClose={() => {
              setSettingsDialogOpen(false);
            }}
            onSave={handleSaveSettings}
            initialSettings={settingsInitial}
          />
        </Box>
      )}

      {/* ── Settings tab ──────────────────────────────────────────── */}
      {tab === 1 && (
        <Box sx={{ maxWidth: 480 }}>
          <Typography variant='h6' gutterBottom>
            Default Notification Preferences
          </Typography>
          <Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
            These settings will apply to any new feed subscriptions you create
          </Typography>

          <FormControl component='fieldset' sx={{ mb: 3, display: 'block' }}>
            <FormLabel component='legend' sx={{ fontWeight: 500, mb: 1 }}>
              Notification Frequency
            </FormLabel>
            <Select
              value={defaultFrequency}
              onChange={(e) => {
                setDefaultFrequency(
                  e.target.value as NotificationSettings['frequency'],
                );
              }}
              size='small'
            >
              <MenuItem value='onChange'>Whenever there is a change</MenuItem>
              <MenuItem value='weekly'>Weekly digest</MenuItem>
              <MenuItem value='monthly'>Monthly digest</MenuItem>
              <MenuItem value='quarterly'>Quarterly digest</MenuItem>
            </Select>
          </FormControl>

          <FormControl component='fieldset' sx={{ mb: 3, display: 'block' }}>
            <FormLabel component='legend' sx={{ fontWeight: 500, mb: 1 }}>
              Notify Me About
            </FormLabel>
            <FormGroup>
              {CHANGE_TYPE_OPTIONS.map((opt) => (
                <FormControlLabel
                  key={opt.value}
                  control={
                    <Checkbox
                      checked={defaultChangeTypes.includes(opt.value)}
                      onChange={() => {
                        handleDefaultChangeTypeToggle(opt.value);
                      }}
                    />
                  }
                  label={opt.label}
                />
              ))}
            </FormGroup>
          </FormControl>

          <Button
            variant='contained'
            onClick={() => {
              // Settings saved in local state; in a real app this would persist
            }}
          >
            Save Preferences
          </Button>
        </Box>
      )}
    </AccountSectionContainer>
  );
}
