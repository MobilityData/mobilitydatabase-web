'use client';
import React from 'react';
import { Link, Typography, useTheme } from '@mui/material';
import NextLink from 'next/link';
import { fontFamily } from '../Theme';

interface FooterLinkProps {
  href: string;
  external?: boolean;
  children: React.ReactNode;
}

export const FooterLink: React.FC<FooterLinkProps> = ({
  href,
  external,
  children,
}) => {
  const theme = useTheme();
  return (
    <Link
      component={NextLink}
      href={href}
      target={external === true ? '_blank' : undefined}
      rel={external === true ? 'noopener noreferrer' : undefined}
      sx={{
        color: theme.palette.text.secondary,
        textDecoration: 'none',
        fontSize: theme.typography.body2.fontSize,
        fontFamily: fontFamily.secondary,
        display: 'block',
        marginBottom: 1.5,
        transition: 'color 0.2s',
        '&:hover': {
          color: theme.palette.text.primary,
        },
      }}
    >
      {children}
    </Link>
  );
};
export const FooterColumnTitle: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const theme = useTheme();
  return (
    <Typography
      variant='subtitle2'
      sx={{
        fontWeight: 700,
        mb: 2,
        fontFamily: fontFamily.secondary,
        fontSize: theme.typography.body2.fontSize,
      }}
    >
      {children}
    </Typography>
  );
};
