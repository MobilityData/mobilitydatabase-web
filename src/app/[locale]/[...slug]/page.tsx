'use client';

// This page is temporary to ease the migration to Next.js App Router
// It will be deprecated once the migration is fully complete
import { type ReactNode, use, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { PersistGate } from 'redux-persist/integration/react';
import { persistStore } from 'redux-persist';
import { store } from '../../store/store';
import { useAppDispatch } from '../../hooks';
import { resetProfileErrors } from '../../store/profile-reducer';

const App = dynamic(async () => await import('../../App'), { ssr: false });

const persistor = persistStore(store);

interface PageProps {
  params: Promise<{
    locale: string;
    slug: string[];
  }>;
}

export default function Page({ params }: PageProps): ReactNode {
  const { locale } = use(params);
  const pathKey = use(params).slug?.join('/') ?? '/';
  const dispatch = useAppDispatch();

  useEffect(() => {
    // Clean errors from previous session
    dispatch(resetProfileErrors());
  }, [dispatch]);

  // Pass locale to App so BrowserRouter can use correct basename
  return (
    <PersistGate loading={null} persistor={persistor}>
      <App locale={locale} key={pathKey} />;
    </PersistGate>
  );
}
