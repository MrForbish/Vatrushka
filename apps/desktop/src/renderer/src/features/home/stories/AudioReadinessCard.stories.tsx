import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { AudioReadinessCard } from '../components/AudioReadinessCard';

const microphone = { deviceId: 'microphone-studio', groupId: 'input', kind: 'audioinput', label: 'HyperX QuadCast S', toJSON: () => ({}) } as MediaDeviceInfo;
const headset = { deviceId: 'headset-usb', groupId: 'output', kind: 'audiooutput', label: 'Наушники Arctis Nova 7 (Game)', toJSON: () => ({}) } as MediaDeviceInfo;

const meta = {
  title: 'Home/AudioReadinessCard',
  component: AudioReadinessCard,
  decorators: [(Story) => <div style={{ width: 850 }}><Story /></div>],
  args: { devices: { inputs: [microphone], outputs: [headset] }, microphoneId: microphone.deviceId, outputId: headset.deviceId, busy: false, inputLevel: 0.58, permission: 'granted', signalDetected: true, testing: true, onMicrophone: fn(), onOutput: fn(), onRefresh: fn(), onTestOutput: fn() },
} satisfies Meta<typeof AudioReadinessCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};
export const NoMicrophone: Story = { args: { devices: { inputs: [], outputs: [headset] }, microphoneId: undefined, inputLevel: 0 } };
export const PermissionDenied: Story = { args: { inputLevel: 0, permission: 'denied', signalDetected: false, testing: false } };
export const SignalMissing: Story = { args: { inputLevel: 0, signalDetected: false } };
export const OutputTestRunning: Story = { args: { busy: true } };
export const LongWindowsDeviceNames: Story = { args: { devices: { inputs: [{ ...microphone, label: 'Микрофон (VB-Audio Virtual Cable Output — очень длинное системное имя устройства Windows)' }], outputs: [{ ...headset, label: 'Динамики (Realtek(R) Audio — устройство воспроизведения высокой чёткости)' }] } } };
