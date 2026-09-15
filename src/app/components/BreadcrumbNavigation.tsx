'use client';

import { Button, Grid, Typography } from '@mui/material';
import { ChevronLeft } from '@mui/icons-material';
import { useTranslations } from 'next-intl';
import { Fragment } from 'react';
import { Link, useRouter } from '../../i18n/navigation';

export interface Crumb {
  label: string;
  /** Omit on the trailing crumb - the page the user is already on. */
  href?: string;
}

interface Props {
  crumbs: Crumb[];
  /** Where the back button goes when there is no history to pop. */
  backFallbackHref?: string;
}

export default function BreadcrumbNavigation({
  crumbs,
  backFallbackHref = '/feeds',
}: Props): React.ReactElement {
  const t = useTranslations('common');
  const router = useRouter();

  const handleBack = (): void => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push(backFallbackHref);
  };

  return (
    <Grid container spacing={3} alignItems='center'>
      <Button
        size='large'
        startIcon={<ChevronLeft />}
        color={'inherit'}
        onClick={handleBack}
      >
        {t('back')}
      </Button>

      <Grid>
        <Typography
          sx={{
            a: {
              textDecoration: 'none',
            },
          }}
        >
          {crumbs.map((crumb, index) => {
            const next = crumbs[index + 1];
            return (
              <Fragment key={crumb.label}>
                {crumb.href != undefined ? (
                  <Button
                    variant='text'
                    component={Link}
                    href={crumb.href}
                    className='inline'
                  >
                    {crumb.label}
                  </Button>
                ) : (
                  <span data-testid='breadcrumb-current-page'>
                    {crumb.label}
                  </span>
                )}
                {next != undefined && (next.href != undefined ? '/' : '/ ')}
              </Fragment>
            );
          })}
        </Typography>
      </Grid>
    </Grid>
  );
}
