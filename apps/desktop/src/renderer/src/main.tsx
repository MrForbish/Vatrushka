import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import '@fontsource-variable/manrope/index.css';
import '@fontsource-variable/onest/index.css';
import '@fontsource-variable/unbounded/wght.css';
import '@fontsource/ibm-plex-mono/400.css';

import App from './App.js';
import { AppRouter } from './app/routes';
import './ui/foundations/tokens.css';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element was not found');
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 24 * 60 * 60 * 1000,
      refetchOnWindowFocus: true,
      retry: 1,
      staleTime: 15_000,
    },
  },
});

createRoot(root).render(<StrictMode><QueryClientProvider client={queryClient}><AppRouter><App /></AppRouter></QueryClientProvider></StrictMode>);
