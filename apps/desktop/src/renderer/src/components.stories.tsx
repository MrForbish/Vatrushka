import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { AuthPanel } from './components';
import './styles.css';

const meta = {
  title: 'Screens/Current',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const PasswordLogin: Story = {
  render: () => <AuthPanel mode="password" stage="credentials" factor="email" totpAvailable email="owner@myvatrushka.ru" code="" password="secure-vatrushka-42" passwordConfirmation="" rememberSession retrySeconds={0} busy={false} error={null} notice={null} onMode={fn()} onReset={fn()} onEmailChange={fn()} onCodeChange={fn()} onPasswordChange={fn()} onPasswordConfirmationChange={fn()} onRememberSessionChange={fn()} onRequest={fn()} onVerify={fn()} onFactor={fn()} onBack={fn()} />,
};

export const PasswordReset: Story = {
  render: () => <AuthPanel mode="reset" stage="otp" factor="email" totpAvailable={false} email="owner@myvatrushka.ru" code="123456" password="new-secure-password-42" passwordConfirmation="new-secure-password-42" rememberSession retrySeconds={0} busy={false} error={null} notice={null} onMode={fn()} onReset={fn()} onEmailChange={fn()} onCodeChange={fn()} onPasswordChange={fn()} onPasswordConfirmationChange={fn()} onRememberSessionChange={fn()} onRequest={fn()} onVerify={fn()} onFactor={fn()} onBack={fn()} />,
};
