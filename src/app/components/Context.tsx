'use client';

import React from 'react';
import type ContextProviderProps from '../interface/ContextProviderProps';
import { Provider } from 'react-redux';
import { store } from '../store/store';

/**
 * This component is used to wrap the entire application with Redux Provider
 * It provides the Redux store to all components in the app
 * IMPORTANT: This does not include the PersistGate, which is applied by
 * route-level wrappers where delayed rendering is required.
 * This allows for a fast initial render, but makes it possible for components to access the store before it's fully rehydrated.
 * This also allows for us to have SSG pages that use Redux. It also allows for these pages to be rendered purely in HTML on the server side without waiting for Redux Persist to rehydrate the store.
 * Use the `useRehydrated` hook to check rehydration status if needed.
 */
const ContextProviders: React.FC<ContextProviderProps> = ({ children }) => {
  return <Provider store={store}>{children}</Provider>;
};

export default ContextProviders;
