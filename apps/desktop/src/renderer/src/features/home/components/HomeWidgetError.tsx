import { Button, Icon } from '../../../ui';

export interface HomeWidgetErrorProps {
  message: string;
  onRetry?: (() => void) | undefined;
}

export function HomeWidgetError({ message, onRetry }: HomeWidgetErrorProps): React.JSX.Element {
  return <div className="home-offline-banner" role="alert"><Icon name="warning" size={17} /><span><strong>Нет подключения</strong><small>{message}</small></span>{onRetry ? <Button onClick={onRetry} size="sm" variant="quiet">Повторить</Button> : null}</div>;
}
