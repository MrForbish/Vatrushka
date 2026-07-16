import type { Meta, StoryObj } from '@storybook/react-vite';

import './foundations.stories.css';

const samples = [
  ['display-xl', '--text-display-xl', 'Добро пожаловать в Ватрушку'],
  ['display-md', '--text-display-md', 'Ваше место для общения'],
  ['heading-lg', '--text-heading-lg', 'Голосовой канал'],
  ['heading-md', '--text-heading-md', 'Настройки сервера'],
  ['heading-sm', '--text-heading-sm', 'Участники онлайн'],
  ['body-lg', '--text-body-lg', 'Вечером собираемся обсудить следующую версию.'],
  ['body-md', '--text-body-md', 'Основной текст интерфейса и настроек'],
  ['label-md', '--text-label-md', 'Подключиться к каналу'],
  ['caption', '--text-caption', 'Сегодня, в 20:15'],
  ['overline', '--text-overline', 'АДМИНИСТРАТОРЫ'],
  ['mono-sm', '--text-mono-sm', 'PING 42 MS · 60 FPS'],
] as const;

const meta = { title: 'Foundations/Typography', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Scale: Story = {
  render: () => (
    <main className="vui-story-surface">
      <h1 className="vui-story-heading">Типографическая шкала</h1>
      <p className="vui-story-description">Onest для UI, Unbounded для акцентов, IBM Plex Mono для технических данных.</p>
      <div>
        {samples.map(([name, token, text]) => (
          <div className="type-sample" key={name}>
            <code className="type-sample__token">{name}</code>
            <span style={{ font: `var(${token})` }}>{text}</span>
          </div>
        ))}
      </div>
    </main>
  ),
};
