import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource-variable/manrope/index.css';
import '@fontsource-variable/onest/index.css';
import '@fontsource-variable/unbounded/wght.css';
import '@fontsource/ibm-plex-mono/400.css';

import App from './App.js';
import './ui/foundations/tokens.css';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element was not found');

createRoot(root).render(<StrictMode><App /></StrictMode>);
