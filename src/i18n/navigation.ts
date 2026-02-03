import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/**
 * Locale-aware navigation APIs.
 *
 * Use these instead of Next.js navigation to automatically handle locale prefixes:
 * - Link: Locale-aware link component
 * - redirect: Server-side redirect with locale
 * - usePathname: Get pathname without locale prefix
 * - useRouter: Router with locale-aware navigation
 * - getPathname: Get localized pathname
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
