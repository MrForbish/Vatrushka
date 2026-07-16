import '@fontsource-variable/onest';
import '@fontsource-variable/unbounded/wght.css';
import '@fontsource/ibm-plex-mono/400.css';
import type { Preview } from '@storybook/react-vite';
import { initialize, mswLoader } from 'msw-storybook-addon';

import '../src/renderer/src/ui/foundations/tokens.css';
import '../src/renderer/src/ui/foundations/global.css';
import { installDesktopMock } from '../src/renderer/src/ui/testing/desktop.mock';
import { defaultHandlers } from '../src/renderer/src/ui/testing/handlers';

initialize({ onUnhandledRequest: 'bypass' });
installDesktopMock();

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: { default: 'canvas' },
    layout: 'centered',
    a11y: { test: 'error' },
    msw: { handlers: defaultHandlers },
  },
  loaders: [mswLoader],
};

export default preview;
