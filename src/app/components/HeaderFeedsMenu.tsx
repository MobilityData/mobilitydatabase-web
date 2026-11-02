'use client';

import * as React from 'react';
import { Box, Button, MenuList, Popover } from '@mui/material';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import { useTranslations } from 'next-intl';
import { Link } from '../../i18n/navigation';
import { FEEDS_TARGET, feedsMenuItems } from '../constants/Navigation';
import { animatedButtonStyling, HeaderMenuItem } from './Header.style';

interface Props {
  title: string;
  isActive: boolean;
}

/**
 * Desktop "Feeds" header entry. Clicking it goes to the feed search, like
 * before; hovering it (or pressing ArrowDown while it has focus) opens a
 * dropdown with the feed search and the location directory, in the same
 * style as the "Tools" menu.
 */
export default function HeaderFeedsMenu({
  title,
  isActive,
}: Props): React.ReactElement {
  const t = useTranslations('common');
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [openedByKeyboard, setOpenedByKeyboard] = React.useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined);

  React.useEffect(() => {
    return () => {
      clearTimeout(closeTimer.current);
    };
  }, []);

  const handleOpen = (e: React.MouseEvent<HTMLElement>): void => {
    clearTimeout(closeTimer.current);
    setOpenedByKeyboard(false);
    setAnchorEl(e.currentTarget);
  };

  const handleClose = (): void => {
    closeTimer.current = setTimeout(() => {
      setAnchorEl(null);
    }, 80);
  };

  const closeNow = (): void => {
    clearTimeout(closeTimer.current);
    setAnchorEl(null);
  };

  return (
    <Box
      component='span'
      onMouseEnter={handleOpen}
      onMouseLeave={handleClose}
      sx={{ display: 'inline-flex' }}
    >
      <Button
        component={Link}
        href={FEEDS_TARGET}
        data-cy='header-feeds'
        aria-controls='feeds-menu'
        aria-haspopup='true'
        aria-expanded={anchorEl !== null}
        endIcon={<ArrowDropDownIcon />}
        onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpenedByKeyboard(true);
            setAnchorEl(e.currentTarget);
          }
        }}
        sx={(theme) => ({
          ...animatedButtonStyling(theme),
          color: theme.vars.palette.text.primary,
        })}
        className={isActive ? 'active short' : ''}
      >
        {title}
      </Button>
      <Popover
        id='feeds-menu'
        anchorEl={anchorEl}
        open={anchorEl !== null}
        onClose={closeNow}
        disableScrollLock
        disableRestoreFocus={!openedByKeyboard}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        sx={{ pointerEvents: 'none' }}
        slotProps={{
          paper: {
            onMouseEnter: () => {
              clearTimeout(closeTimer.current);
            },
            onMouseLeave: handleClose,
            sx: { pointerEvents: 'auto', minWidth: 200 },
          },
        }}
      >
        <MenuList
          dense
          autoFocusItem={openedByKeyboard}
          aria-label={t('feedsMenu')}
        >
          {feedsMenuItems.map((item) => (
            <HeaderMenuItem
              key={item.target}
              component={Link}
              href={item.target}
              data-cy={item.dataCy}
              onClick={closeNow}
            >
              {t(item.titleKey)}
            </HeaderMenuItem>
          ))}
        </MenuList>
      </Popover>
    </Box>
  );
}
