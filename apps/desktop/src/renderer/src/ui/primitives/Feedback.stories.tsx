import type { Meta, StoryObj } from '@storybook/react-vite';

import { AudioLevelMeter, Avatar, Badge, Divider, Progress, Skeleton, StatusDot } from './Primitives';
import './stories.css';

const meta = { title: 'Primitives/Feedback & identity', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Catalog: Story = {
  render: () => (
    <main className="primitive-demo">
      <div className="primitive-demo__group"><h3>Badges</h3><div className="primitive-demo__row"><Badge>По умолчанию</Badge><Badge tone="primary">В эфире</Badge><Badge tone="success">Подключено</Badge><Badge tone="warning">Нестабильно</Badge><Badge tone="danger">Ошибка</Badge><Badge tone="founder">Founder · Developer</Badge></div></div>
      <Divider />
      <div className="primitive-demo__group"><h3>Presence & avatars</h3><div className="primitive-demo__row"><Avatar name="Илья Форбиш" size="lg" status="online" /><Avatar name="Анна Лисова" status="idle" /><Avatar name="Системный бот" size="sm" status="streaming" /><StatusDot label="Не беспокоить" status="dnd" /><StatusDot label="Не в сети" status="offline" /></div></div>
      <div className="primitive-demo__group"><h3>Progress & audio</h3><Progress label="Загрузка обновления" value={68} /><AudioLevelMeter label="Уровень микрофона 74%" value={0.74} /></div>
      <div className="primitive-demo__group"><h3>Skeleton</h3><div className="primitive-skeleton-card"><Skeleton height="44px" rounded width="44px" /><div><Skeleton height="14px" width="54%" /><Skeleton height="12px" width="92%" /></div></div></div>
    </main>
  ),
};
