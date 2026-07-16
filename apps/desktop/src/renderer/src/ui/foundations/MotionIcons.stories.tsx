import type { Meta, StoryObj } from '@storybook/react-vite';

import { Icon, type IconName } from '../primitives/Icon';
import './foundations.stories.css';

const iconNames: IconName[] = ['check', 'chevronDown', 'close', 'eye', 'eyeOff', 'info', 'minus', 'search', 'settings', 'sparkles', 'warning'];

const meta = { title: 'Foundations/Motion & Icons', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Catalog: Story = {
  render: () => (
    <main className="vui-story-surface vui-story-stack">
      <section className="vui-story-stack">
        <header><h1 className="vui-story-heading">Motion</h1><p className="vui-story-description">Наведите или переведите фокус на дорожку. Системная настройка reduced motion отключает длинный переход.</p></header>
        <div aria-label="Демонстрация анимации" className="motion-track" role="img" tabIndex={0} />
      </section>
      <section className="vui-story-stack">
        <h2 className="vui-story-heading">Иконки</h2>
        <div className="foundation-grid">
          {iconNames.map((name) => <div className="icon-sample" key={name}><Icon name={name} size={24} /><span>{name}</span></div>)}
        </div>
      </section>
    </main>
  ),
};
