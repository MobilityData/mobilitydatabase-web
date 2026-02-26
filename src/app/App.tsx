'use client';

import './App.css';
import AppRouter from './router/Router';
import { MemoryRouter } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { anonymousLogin } from './store/profile-reducer';
import { app } from '../firebase';
import { Suspense, useEffect, useState } from 'react';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import AppContainer from './AppContainer';
import { usePathname, useSearchParams } from 'next/navigation';

interface AppProps {
  locale?: string;
}

// Helper function to construct the full path from Next.js routing
function buildPathFromNextRouter(
  pathname: string,
  searchParams: URLSearchParams,
  locale?: string,
): string {
  const cleanPath =
    locale != null && locale !== 'en'
      ? (pathname.replace(`/${locale}`, '') ?? '/')
      : pathname;

  const searchString = searchParams.toString();
  return searchString !== '' ? `${cleanPath}?${searchString}` : cleanPath;
}

function App({ locale }: AppProps): React.ReactElement {
  const dispatch = useDispatch();
  const [isAppReady, setIsAppReady] = useState(false);

  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialPath = buildPathFromNextRouter(pathname, searchParams, locale);

  useEffect(() => {
    const unsubscribe = app.auth().onAuthStateChanged((user) => {
      if (user != null) {
        setIsAppReady(true);
      } else {
        setIsAppReady(false);
        dispatch(anonymousLogin());
      }
    });
    dispatch(anonymousLogin());
    return () => {
      unsubscribe();
    };
  }, [dispatch]);

  return (
    <Suspense>
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        {/* MemoryRouter will be deprecated in favor of Next AppRouter */}
        {/* MemoryRouter synced with Next.js routing via RouterSync component */}
        <MemoryRouter initialEntries={[initialPath]}>
          <AppContainer>{isAppReady ? <AppRouter /> : null}</AppContainer>
        </MemoryRouter>
      </LocalizationProvider>
    </Suspense>
  );
}

export default App;
