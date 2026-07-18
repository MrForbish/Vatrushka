import { useEffect, useMemo, useState } from 'react';

import type { PermissionOverwriteTargetType, ServerDetail, ServerPermission } from '@vatrushka/shared';

import { Button, Select } from '../../../ui';
import './channel-permission-editor.css';

type OverwriteState = 'inherit' | 'allow' | 'deny';

function definitions(items: Array<[ServerPermission, string, string]>): Array<{ permission: ServerPermission; label: string; description: string }> {
  return items.map(([permission, label, description]) => ({ permission, label, description }));
}

const permissionGroups: Array<{
  id: string;
  label: string;
  permissions: Array<{ permission: ServerPermission; label: string; description: string }>;
}> = [
  {
    id: 'text',
    label: 'Текстовые каналы',
    permissions: definitions([
      ['VIEW_CHANNEL', 'Видеть канал', 'Видеть канал в списке и открывать его.'],
      ['READ_MESSAGE_HISTORY', 'Читать историю', 'Просматривать ранее отправленные сообщения.'],
      ['SEND_MESSAGES', 'Отправлять сообщения', 'Писать в текстовых каналах.'],
      ['SEND_ATTACHMENTS', 'Прикреплять файлы', 'Загружать изображения и документы.'],
      ['ADD_REACTIONS', 'Добавлять реакции', 'Ставить эмодзи-реакции на сообщения.'],
      ['EMBED_LINKS', 'Встраивать ссылки', 'Показывать предпросмотр ссылок.'],
      ['MENTION_EVERYONE', 'Упоминать всех', 'Отправлять массовые упоминания.'],
      ['MANAGE_OWN_MESSAGES', 'Управлять своими сообщениями', 'Редактировать и удалять собственные сообщения.'],
      ['MANAGE_MESSAGES', 'Управлять сообщениями', 'Редактировать и удалять чужие сообщения.'],
      ['PIN_MESSAGES', 'Закреплять сообщения', 'Добавлять сообщения в список важных.'],
      ['CREATE_THREADS', 'Создавать обсуждения', 'Создавать ветки по сообщениям.'],
    ]),
  },
  {
    id: 'voice',
    label: 'Голос и демонстрация',
    permissions: definitions([
      ['CONNECT_VOICE', 'Подключаться к голосу', 'Входить в голосовые каналы.'],
      ['SPEAK', 'Говорить', 'Передавать голос в голосовом канале.'],
      ['STREAM_SCREEN', 'Демонстрировать экран', 'Запускать показ экрана или приложения.'],
      ['STREAM_APPLICATION_AUDIO', 'Передавать звук приложения', 'Добавлять системный звук к демонстрации.'],
      ['USE_PRIORITY_VOICE', 'Приоритет голоса', 'Получать приоритет во время разговора.'],
      ['MUTE_MEMBERS', 'Выключать микрофоны', 'Принудительно отключать голос участников.'],
      ['DEAFEN_MEMBERS', 'Отключать звук участникам', 'Запрещать участникам слышать канал.'],
      ['MOVE_MEMBERS', 'Перемещать участников', 'Переводить участников между каналами.'],
      ['STOP_OTHERS_STREAM', 'Останавливать демонстрации', 'Завершать чужой показ экрана.'],
      ['CREATE_TEMPORARY_VOICE', 'Временные голосовые каналы', 'Создавать голосовые комнаты на время.'],
    ]),
  },
];

export interface ChannelPermissionEditorProps {
  server: ServerDetail;
  onSave(channelId: string, targetType: PermissionOverwriteTargetType, targetId: string, allow: ServerPermission[], deny: ServerPermission[]): Promise<void>;
}

export function ChannelPermissionEditor({ onSave, server }: ChannelPermissionEditorProps): React.JSX.Element {
  const [channelId, setChannelId] = useState(server.channels[0]?.id ?? '');
  const [targetType, setTargetType] = useState<PermissionOverwriteTargetType>('ROLE');
  const [targetId, setTargetId] = useState('');
  const [states, setStates] = useState<Partial<Record<ServerPermission, OverwriteState>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const channel = server.channels.find((item) => item.id === channelId) ?? server.channels[0] ?? null;
  const targets = useMemo(
    () =>
      targetType === 'ROLE'
        ? server.roles.filter((role) => role.kind !== 'OWNER').map((role) => ({ value: role.id, label: role.name }))
        : server.members.map((member) => ({ value: member.userId, label: member.displayName })),
    [server.members, server.roles, targetType],
  );

  useEffect(() => {
    if (channel && channel.id !== channelId) setChannelId(channel.id);
  }, [channel, channelId]);

  useEffect(() => {
    setTargetId((current) => (targets.some((target) => target.value === current) ? current : targets[0]?.value ?? ''));
  }, [targets]);

  useEffect(() => {
    const overwrite = channel?.permissionOverwrites?.find((item) => item.targetType === targetType && item.targetId === targetId);
    const next: Partial<Record<ServerPermission, OverwriteState>> = {};
    for (const group of permissionGroups) {
      for (const definition of group.permissions) {
        next[definition.permission] = overwrite?.allow.includes(definition.permission)
          ? 'allow'
          : overwrite?.deny.includes(definition.permission)
            ? 'deny'
            : 'inherit';
      }
    }
    setStates(next);
    setSaved(false);
    setError(null);
  }, [channel, targetId, targetType]);

  const save = async (): Promise<void> => {
    if (!channel || !targetId) return;
    const entries = Object.entries(states) as Array<[ServerPermission, OverwriteState]>;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await onSave(
        channel.id,
        targetType,
        targetId,
        entries.filter(([, state]) => state === 'allow').map(([permission]) => permission),
        entries.filter(([, state]) => state === 'deny').map(([permission]) => permission),
      );
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить права канала');
    } finally {
      setBusy(false);
    }
  };

  if (server.channels.length === 0) return <p className="vui-server-settings-empty">Создайте канал, чтобы настроить его права.</p>;

  return (
    <article className="vui-server-settings-card vui-channel-permissions">
      <div>
        <h2>Права конкретного канала</h2>
        <p>«Наследовать» использует права роли сервера. Персональная настройка участника применяется последней.</p>
      </div>
      <div className="vui-channel-permissions__toolbar">
        <Select label="Канал" onValueChange={setChannelId} options={server.channels.map((item) => ({ value: item.id, label: `${item.type === 'text' ? '#' : '◉'} ${item.name}` }))} value={channel?.id ?? ''} />
        <Select label="Для кого" onValueChange={(value) => setTargetType(value as PermissionOverwriteTargetType)} options={[{ value: 'ROLE', label: 'Роль' }, { value: 'MEMBER', label: 'Участник' }]} value={targetType} />
        <Select disabled={targets.length === 0} label={targetType === 'ROLE' ? 'Роль' : 'Участник'} onValueChange={setTargetId} options={targets.length > 0 ? targets : [{ value: '', label: 'Нет доступных вариантов', disabled: true }]} value={targetId} />
      </div>
      <div className="vui-channel-permissions__groups">
        {permissionGroups.map((group) => (
          <section key={group.id}>
            <h3>{group.label}</h3>
            {group.permissions.map((definition) => (
              <div className="vui-channel-permissions__row" key={definition.permission}>
                <span><strong>{definition.label}</strong><small>{definition.description}</small></span>
                <div aria-label={`Право ${definition.label}`} role="group">
                  {(['inherit', 'allow', 'deny'] as const).map((state) => (
                    <button aria-pressed={states[definition.permission] === state} className={`vui-channel-permissions__state vui-channel-permissions__state--${state}`} key={state} onClick={() => { setStates((current) => ({ ...current, [definition.permission]: state })); setSaved(false); }} type="button">
                      {state === 'inherit' ? 'Наследовать' : state === 'allow' ? 'Разрешить' : 'Запретить'}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
      {error ? <div className="vui-server-settings-feedback" data-tone="danger">{error}</div> : null}
      {saved ? <div className="vui-server-settings-feedback" data-tone="success">Права канала сохранены</div> : null}
      <Button disabled={!targetId} loading={busy} onClick={() => void save()}>Сохранить права канала</Button>
    </article>
  );
}
