import { type ReactElement } from 'react';
import { Breadcrumbs, Typography } from '@mui/material';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import { Link } from '../../../../i18n/navigation';

export interface LocationCrumb {
  label: string;
  /** Omitted on the trailing crumb, the page the user is on. */
  href?: string;
}

interface Props {
  crumbs: LocationCrumb[];
  ariaLabel: string;
}

export default function LocationBreadcrumbs({
  crumbs,
  ariaLabel,
}: Props): ReactElement {
  return (
    <Breadcrumbs
      aria-label={ariaLabel}
      separator={<NavigateNextIcon fontSize='small' />}
      data-testid='location-breadcrumbs'
      sx={{
        mb: 1,
        '& .MuiBreadcrumbs-ol': { rowGap: 0.5 },
        '& a': {
          color: 'text.secondary',
          textDecoration: 'none',
          borderRadius: '4px',
        },
        '& a:hover': { color: 'primary.main', textDecoration: 'underline' },
        '& a:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: '2px',
        },
      }}
    >
      {crumbs.map((crumb) =>
        crumb.href != undefined ? (
          <Link key={crumb.href} href={crumb.href}>
            {crumb.label}
          </Link>
        ) : (
          <Typography
            key={crumb.label}
            color='text.primary'
            fontWeight={600}
            aria-current='page'
          >
            {crumb.label}
          </Typography>
        ),
      )}
    </Breadcrumbs>
  );
}
