'use client';

import './App.css';
import AppRouter from './router/Router';
import { BrowserRouter } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { anonymousLogin } from './store/profile-reducer';
import { app } from '../firebase';
import { Suspense, useEffect, useState } from 'react';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import AppContainer from './AppContainer';

interface AppProps {
  locale?: string;
}

function App({ locale }: AppProps): React.ReactElement {
  const dispatch = useDispatch();
  const [isAppReady, setIsAppReady] = useState(false);

  // Determine basename for BrowserRouter based on locale
  // Non-default locales (e.g., 'fr') need their prefix as basename
  const basename = locale != null && locale !== 'en' ? `/${locale}` : undefined;

  useEffect(() => {
    app.auth().onAuthStateChanged((user) => {
      if (user != null) {
        setIsAppReady(true);
      } else {
        setIsAppReady(false);
        dispatch(anonymousLogin());
      }
    });
    dispatch(anonymousLogin());
  }, [dispatch]);

  return (
    <Suspense>
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        {/* BrowserRouter will be deprecated in favor of Next AppRouter */}
        <BrowserRouter basename={basename}>
          <AppContainer>{isAppReady ? <AppRouter /> : null}</AppContainer>
        </BrowserRouter>
      </LocalizationProvider>
    </Suspense>
  );
}

export default App;
