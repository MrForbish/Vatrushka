import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource-variable/manrope/index.css';
import '@fontsource-variable/unbounded/wght.css';

import App from './App.js';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element was not found');

createRoot(root).render(<StrictMode><App /></StrictMode>);
