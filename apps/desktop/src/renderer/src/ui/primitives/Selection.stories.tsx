import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, fn, userEvent, within } from 'storybook/test';

import { Checkbox, RadioGroup, SegmentedControl, Slider, Switch } from './Primitives';
import './stories.css';

const meta = {
  title: 'Primitives/Selection controls',
  component: Switch,
  parameters: { layout: 'fullscreen' },
  args: { checked: false, label: 'Переключатель', onCheckedChange: fn() },
} satisfies Meta<typeof Switch>;
export default meta;
type Story = StoryObj<typeof meta>;
const sliderKeyDown = fn();

function SelectionCatalog(): React.JSX.Element {
  const [section, setSection] = useState<'general' | 'audio' | 'security'>('general');
  const [radio, setRadio] = useState('all');
  const [enabled, setEnabled] = useState(true);
  const [volume, setVolume] = useState(72);
  return (
    <main className="primitive-demo">
      <SegmentedControl label="Раздел настроек" onChange={setSection} options={[{ value: 'general', label: 'Общие' }, { value: 'audio', label: 'Аудио' }, { value: 'security', label: 'Безопасность' }]} value={section} />
      <div className="primitive-demo__grid">
        <div className="primitive-demo__group"><Checkbox defaultChecked label="Разрешить уведомления" description="Показывать системные уведомления Windows" /><Checkbox label="Наследовать права категории" indeterminate /><Checkbox disabled label="Системное правило" description="Недоступно для изменения" /></div>
        <RadioGroup label="Кто может писать" name="writers" onChange={setRadio} options={[{ value: 'all', label: 'Все участники' }, { value: 'roles', label: 'Только выбранные роли' }, { value: 'nobody', label: 'Никто', disabled: true }]} value={radio} />
      </div>
      <Switch checked={enabled} description="Передавать звук выбранного приложения" label="Демонстрация со звуком" onCheckedChange={setEnabled} />
      <Slider label="Громкость трансляции" max={100} min={0} onChange={(event) => setVolume(Number(event.target.value))} value={volume} valueLabel={`${volume}%`} />
    </main>
  );
}

export const Catalog: Story = { render: () => <SelectionCatalog /> };

export const SwitchKeyboard: Story = {
  args: { onCheckedChange: fn() },
  render: (args) => <main className="primitive-demo primitive-demo--compact"><Switch checked={false} label="Включить шумоподавление" onCheckedChange={args.onCheckedChange} /></main>,
  play: async ({ args, canvasElement }) => {
    const control = within(canvasElement).getByRole('switch', { name: 'Включить шумоподавление' });
    control.focus();
    await userEvent.keyboard('[Space]');
    await expect(args.onCheckedChange).toHaveBeenCalledWith(true);
  },
};

export const SliderKeyboard: Story = {
  render: () => <main className="primitive-demo primitive-demo--compact"><Slider defaultValue={50} label="Чувствительность микрофона" max={100} min={0} onKeyDown={sliderKeyDown} step={10} /></main>,
  play: async ({ canvasElement }) => {
    const slider = within(canvasElement).getByRole('slider', { name: 'Чувствительность микрофона' });
    slider.focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(sliderKeyDown).toHaveBeenCalledWith(expect.objectContaining({ key: 'ArrowRight' }));
    await fireEvent.change(slider, { target: { value: '60' } });
    await expect(slider).toHaveValue('60');
  },
};
