import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

// MSW browser worker to intercept client-side fetch/XHR
export const worker = setupWorker(...handlers);
