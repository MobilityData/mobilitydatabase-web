'use client';

import * as React from 'react';
import { usePathname, useRouter } from '../../../i18n/navigation';
import { useTheme } from '@mui/material/styles';
import {
  Box,
  Button,
  Container,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Typography,
} from '@mui/material';
import {
  DashboardOutlined,
  ExitToAppOutlined,
  MenuOutlined,
  NotificationsOutlined,
  VpnKeyOutlined,
} from '@mui/icons-material';
import { useTranslations } from 'next-intl';
import LogoutConfirmModal from '../../components/LogoutConfirmModal';
import { useRemoteConfig } from '../../context/RemoteConfigProvider';
import { ProtectedPageWrapper } from '../../components/ProtectedPageWrapper';
import { ReduxGateWrapper } from '../../components/ReduxGateWrapper';

type NavSection = 'general' | 'api-access' | 'notifications';

const NAV_ITEMS: Array<{
  id: NavSection;
  label: string;
  icon: React.ReactElement;
  path: string;
}> = [
  {
    id: 'general',
    label: 'General',
    icon: <DashboardOutlined />,
    path: '/account',
  },
  {
    id: 'api-access',
    label: 'API Access',
    icon: <VpnKeyOutlined />,
    path: '/account/api-access',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: <NotificationsOutlined />,
    path: '/account/notifications',
  },
];

function AccountLayoutContent({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const t = useTranslations('account');
  const tCommon = useTranslations('common');
  const { config } = useRemoteConfig();
  const pathname = usePathname();
  const router = useRouter();
  const theme = useTheme();
  const [openDialog, setOpenDialog] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  let activeSection: NavSection = 'general';
  if (pathname.endsWith('/notifications')) {
    activeSection = 'notifications';
  } else if (pathname.endsWith('/api-access')) {
    activeSection = 'api-access';
  }

  const visibleItems = NAV_ITEMS.filter(
    (item) => item.id !== 'notifications' || config.isNotificationsEnabled,
  );

  const activeItem = visibleItems.find((item) => item.id === activeSection);

  const navList = (onItemClick?: () => void): React.ReactElement => (
    <>
      <List disablePadding>
        {visibleItems.map((item) => (
          <ListItemButton
            key={item.id}
            selected={activeSection === item.id}
            onClick={() => {
              router.push(item.path);
              onItemClick?.();
            }}
            sx={{ borderRadius: 1 }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
      <Button
        fullWidth
        variant='outlined'
        color='primary'
        startIcon={<ExitToAppOutlined />}
        onClick={() => {
          setOpenDialog(true);
          onItemClick?.();
        }}
        data-cy='signOutButton'
        sx={{ mt: 1 }}
      >
        {tCommon('signOut')}
      </Button>
    </>
  );

  return (
    <Container
      component='main'
      maxWidth='xl'
      sx={{
        mx: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <Typography
        component='h1'
        variant='h4'
        color='primary'
        sx={{ fontWeight: 'bold' }}
        alignSelf='flex-start'
      >
        {t('title')}
      </Typography>
      <Box
        sx={{
          display: 'flex',
          width: '100%',
          mt: 2,
          flexDirection: { xs: 'column', lg: 'row' },
        }}
      >
        {/* Sidebar — lg and above */}
        <Paper
          elevation={0}
          sx={{
            display: { xs: 'none', lg: 'block' },
            width: 200,
            mr: 2,
            height: 'fit-content',
            bgcolor: theme.vars.palette.background.paper,
            p: 1,
            flexShrink: 0,
          }}
        >
          {navList()}
        </Paper>

        {/* Mobile nav trigger — md and below */}
        <Box
          role='button'
          tabIndex={0}
          aria-label='Open account navigation'
          onClick={() => {
            setDrawerOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setDrawerOpen(true);
          }}
          sx={{
            display: { xs: 'flex', lg: 'none' },
            alignItems: 'center',
            gap: 1,
            mb: 2,
            p: 1,
            bgcolor: theme.vars.palette.background.paper,
            borderRadius: 1,
            cursor: 'pointer',
            userSelect: 'none',
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <MenuOutlined fontSize='small' />
          {activeItem != null && (
            <>
              {activeItem.icon}
              <Typography variant='body2' fontWeight={600}>
                {activeItem.label}
              </Typography>
            </>
          )}
        </Box>

        {/* Drawer — md and below */}
        <Drawer
          anchor='left'
          open={drawerOpen}
          onClose={() => {
            setDrawerOpen(false);
          }}
          sx={{ display: { lg: 'none' } }}
          slotProps={{ paper: { sx: { width: 240, p: 2 } } }}
        >
          <Typography variant='h6' fontWeight={700} sx={{ mb: 2 }}>
            {t('title')}
          </Typography>
          {navList(() => {
            setDrawerOpen(false);
          })}
        </Drawer>

        <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
      </Box>
      <LogoutConfirmModal openDialog={openDialog} setOpenDialog={setOpenDialog} />
    </Container>
  );
}

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <ReduxGateWrapper>
      <ProtectedPageWrapper>
        <AccountLayoutContent>{children}</AccountLayoutContent>
      </ProtectedPageWrapper>
    </ReduxGateWrapper>
  );
}
