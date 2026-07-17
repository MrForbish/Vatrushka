import type { ReactNode } from 'react';
import { HashRouter } from 'react-router-dom';

export interface AppRouterProps {
  children: ReactNode;
}

export function AppRouter({ children }: AppRouterProps): React.JSX.Element {
  return <HashRouter>{children}</HashRouter>;
}
