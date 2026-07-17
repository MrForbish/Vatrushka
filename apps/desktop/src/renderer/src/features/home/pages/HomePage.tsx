import { useState } from 'react';
import type { HomeDashboardResponse, HomeDestination, PublicUser, RoomConnection, ServerSummary } from '@vatrushka/shared';

import type { AudioDevices } from '../../../audio-devices';
import { AppShell, Avatar, Badge, Button, Icon, Input, Modal, Select } from '../../../ui';
import { ActiveSpacesSection } from '../components/ActiveSpacesSection';
import { AudioReadinessCard } from '../components/AudioReadinessCard';
import { ContinueSection } from '../components/ContinueSection';
import { HomeNavigation } from '../components/HomeNavigation';
import { HomeProfileRail } from '../components/HomeProfileRail';
import { HomeWelcomeCard } from '../components/HomeWelcomeCard';
import { HomeWidgetError } from '../components/HomeWidgetError';
import { HomeWidgetSkeleton } from '../components/HomeWidgetSkeleton';
import { OnboardingChecklist } from '../components/OnboardingChecklist';
import { QuickActionsPanel } from '../components/QuickActionsPanel';
import { RecentActivitySection } from '../components/RecentActivitySection';
import { selectActiveSpaces, selectContinueItems, selectOnboardingSteps, selectRecentActivity } from '../model/home.selectors';
import type { HomeActiveSpaceItem, HomeContinueItem, HomeOnboardingStep, HomeRecentActivityItem } from '../model/home.types';
import { useAudioReadiness } from '../hooks/useAudioReadiness';
import '../home.css';

export interface HomePageProps {
  user: PublicUser;
  version: string;
  devices: AudioDevices;
  microphoneId: string | undefined;
  outputId: string | undefined;
  inputLevel?: number | undefined;
  busy: boolean;
  error: string | null;
  servers: ServerSummary[];
  serverName: string;
  directUnreadCount?: number;
  connection?: RoomConnection | null;
  continueItems?: HomeContinueItem[];
  activeSpaces?: HomeActiveSpaceItem[];
  recentActivity?: HomeRecentActivityItem[];
  onboardingSteps?: HomeOnboardingStep[];
  dashboard?: HomeDashboardResponse | undefined;
  dashboardLoading?: boolean;
  dashboardError?: string | null;
  onRetryDashboard?: (() => void) | undefined;
  onLogout: () => void;
  onSecurity: () => void;
  onMicrophone: (value: string) => void;
  onOutput: (value: string) => void;
  onRefreshDevices: () => void;
  onTestOutput?: (() => void) | undefined;
  onServerName: (value: string) => void;
  onCreateServer: () => void;
  onOpenServer: (serverId: string) => void;
  onOpenDestination?: ((destination: HomeDestination) => void) | undefined;
  onReturnToCall?: (() => void) | undefined;
  onDirectMessages?: (() => void) | undefined;
  onCopyInvite: (inviteUrl: string) => void | Promise<void>;
}

export function HomePage(props: HomePageProps): React.JSX.Element {
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteCopyState, setInviteCopyState] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');
  const [audioTestRevision, setAudioTestRevision] = useState(0);
  const effectiveServers = props.dashboard?.servers ?? props.servers;
  const [inviteServerId, setInviteServerId] = useState(effectiveServers[0]?.id ?? '');
  const name = props.user.displayName ?? props.user.email;
  const hasInput = props.devices.inputs.length > 0;
  const hasOutput = props.devices.outputs.length > 0;
  const audioReady = hasInput && hasOutput;
  const fallbackContinue = selectContinueItems(effectiveServers, props.connection ?? null);
  const remoteContinue = props.continueItems ?? props.dashboard?.continueItems ?? [];
  const continueItems = props.connection === null || props.connection === undefined
    ? remoteContinue.length > 0 ? remoteContinue : fallbackContinue
    : [fallbackContinue[0]!, ...remoteContinue.filter((item) => item.destination.serverId !== props.connection?.serverId)].slice(0, 2);
  const activeSpaces = selectActiveSpaces(props.activeSpaces ?? props.dashboard?.activeSpaces ?? []);
  const recentActivity = selectRecentActivity(props.recentActivity ?? props.dashboard?.recentActivity ?? []);
  const onboardingSteps = props.onboardingSteps ?? props.dashboard?.onboarding.steps ?? selectOnboardingSteps(effectiveServers.length, hasInput, hasOutput);
  const showOnboarding = props.dashboard?.onboarding.visible ?? effectiveServers.length === 0;
  const selectedInviteServer = effectiveServers.find((server) => server.id === inviteServerId) ?? effectiveServers[0];
  const connectionStatus = props.dashboardError ? 'offline' : props.dashboard?.readiness.connection ?? (props.error ? 'degraded' : 'healthy');
  const presence = props.dashboard?.user.presence ?? 'online';
  const audioReadiness = useAudioReadiness(props.microphoneId, props.connection === null || props.connection === undefined, audioTestRevision);
  const openDestination = (destination: HomeDestination): void => {
    if (props.onOpenDestination) props.onOpenDestination(destination);
    else props.onOpenServer(destination.serverId);
  };
  const openInvite = (): void => {
    if (effectiveServers.length === 0) setCreateOpen(true);
    else {
      setInviteCopyState('idle');
      setInviteOpen(true);
    }
  };
  const copyInvite = async (): Promise<void> => {
    if (!selectedInviteServer) return;
    setInviteCopyState('copying');
    try {
      await props.onCopyInvite(selectedInviteServer.inviteUrl);
      setInviteCopyState('copied');
    } catch {
      setInviteCopyState('error');
    }
  };
  const openContinue = (item: HomeContinueItem): void => {
    if (item.type === 'active_call' && props.onReturnToCall !== undefined) props.onReturnToCall();
    else openDestination(item.destination);
  };
  const scrollToAudio = (): void => document.getElementById('home-audio')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const scrollToSpaces = (): void => document.getElementById('home-active-spaces')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return <>
    <AppShell
      members={<HomeProfileRail onLogout={props.onLogout} onSecurity={props.onSecurity} presence={presence} user={props.user} version={props.version} />}
      membersDrawerTitle="Профиль"
      renderMembersToggle={(open) => <button aria-label="Открыть профиль" className="home-header__profile-trigger" onClick={open} type="button"><Avatar name={name} size="sm" status={presence} /></button>}
      topBar={<div className="home-header"><Icon name="home" size={19} /><span><strong>Главная</strong><small>Ваш персональный центр Vatrushka</small></span><Badge>v{props.version}</Badge></div>}
      variant="home"
      workspaceLibrary={<HomeNavigation directUnreadCount={props.directUnreadCount ?? 0} networkAvailable={connectionStatus !== 'offline'} onCreate={() => setCreateOpen(true)} onDirectMessages={props.onDirectMessages} onLogout={props.onLogout} onOpenServer={props.onOpenServer} onSecurity={props.onSecurity} onSpaces={scrollToSpaces} servers={effectiveServers} user={props.user} />}
    >
      <div className="home-dashboard">
        <div className="home-dashboard__inner">
          {props.dashboardError ? <HomeWidgetError message={props.dashboard === undefined ? props.dashboardError : 'Показываем последние сохранённые данные.'} onRetry={props.onRetryDashboard} /> : props.error ? <HomeWidgetError message={props.error} /> : null}
          <HomeWelcomeCard audioReady={audioReady} connection={connectionStatus} user={props.user} />
          {props.dashboardLoading && props.dashboard === undefined && props.continueItems === undefined ? <HomeWidgetSkeleton label="Загрузка блока Продолжить" /> : <ContinueSection items={continueItems} onOpen={openContinue} />}
          <div className="home-dashboard__columns">
            <div id="home-active-spaces">{props.dashboardLoading && props.dashboard === undefined && props.activeSpaces === undefined ? <HomeWidgetSkeleton label="Загрузка активных пространств" rows={3} /> : <ActiveSpacesSection items={activeSpaces} onOpen={(item) => openDestination(item.destination)} />}</div>
            {props.dashboardLoading && props.dashboard === undefined && props.recentActivity === undefined ? <HomeWidgetSkeleton label="Загрузка недавней активности" rows={3} /> : <RecentActivitySection items={recentActivity} onOpen={(item) => { if (item.destination) openDestination(item.destination); }} />}
            <QuickActionsPanel networkAvailable={connectionStatus !== 'offline'} onAudio={scrollToAudio} onCreate={() => setCreateOpen(true)} onInvite={openInvite} />
          </div>
          <AudioReadinessCard busy={props.busy} devices={props.devices} error={audioReadiness.error} inputLevel={props.inputLevel ?? audioReadiness.inputLevel} microphoneId={props.microphoneId} onMicrophone={props.onMicrophone} onOutput={props.onOutput} onRefresh={() => { props.onRefreshDevices(); setAudioTestRevision((value) => value + 1); }} onTestOutput={props.onTestOutput} outputId={props.outputId} permission={audioReadiness.permission} signalDetected={props.inputLevel !== undefined ? props.inputLevel > 0.025 : audioReadiness.signalDetected} testing={props.connection !== null && props.connection !== undefined || audioReadiness.testing} />
          {showOnboarding ? <OnboardingChecklist onCreate={() => setCreateOpen(true)} onOpen={(step) => { if (step.destination) openDestination(step.destination); }} steps={onboardingSteps} /> : null}
        </div>
      </div>
    </AppShell>
    <Modal footer={<><Button onClick={() => setCreateOpen(false)} type="button" variant="quiet">Отмена</Button><Button disabled={connectionStatus === 'offline' || props.busy || props.serverName.trim().length < 2} icon="plus" loading={props.busy} onClick={props.onCreateServer} type="button">Создать</Button></>} onClose={() => setCreateOpen(false)} open={createOpen} title="Новый сервер"><Input autoFocus id="home-server-name" label="Название" maxLength={60} minLength={2} onChange={(event) => props.onServerName(event.target.value)} placeholder="Команда разработки" value={props.serverName} /></Modal>
    <Modal description="Выберите сервер и отправьте короткую ссылку человеку, которого хотите пригласить." footer={<><Button onClick={() => setInviteOpen(false)} type="button" variant="quiet">Закрыть</Button><Button disabled={selectedInviteServer === undefined || inviteCopyState === 'copying'} icon={inviteCopyState === 'copied' ? 'check' : 'copy'} loading={inviteCopyState === 'copying'} onClick={() => void copyInvite()} type="button">{inviteCopyState === 'copied' ? 'Ссылка скопирована' : inviteCopyState === 'error' ? 'Повторить' : 'Скопировать ссылку'}</Button></>} onClose={() => setInviteOpen(false)} open={inviteOpen} size="sm" title="Пригласить друзей"><div className="home-invite-dialog"><Select label="Сервер" onValueChange={(value) => { setInviteServerId(value); setInviteCopyState('idle'); }} options={effectiveServers.map((server) => ({ value: server.id, label: server.name }))} value={selectedInviteServer?.id ?? ''} />{selectedInviteServer ? <p><Icon name="link" size={16} /><span>{selectedInviteServer.inviteUrl}</span></p> : null}</div></Modal>
  </>;
}
