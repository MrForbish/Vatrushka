import { useEffect, useMemo, useRef, useState } from 'react';

import type { DesktopSourceInfo } from '@vatrushka/shared';

import { Badge, Button, Checkbox, Icon, IconButton, RadioGroup, SegmentedControl } from '../../ui';
import './source-picker.css';

type SourceTab = DesktopSourceInfo['type'];

export interface SourcePickerProps {
  sources: DesktopSourceInfo[];
  includeAudio: boolean;
  platform: string;
  busy?: boolean;
  onAudio(value: boolean): void;
  onSelect(source: DesktopSourceInfo): void;
  onCancel(): void;
}

function sourceTitle(source: DesktopSourceInfo, index: number): string {
  if (source.name.trim().length > 0) return source.name;
  return source.type === 'screen' ? `Экран ${index + 1}` : 'Окно без названия';
}

function sourceDescription(source: DesktopSourceInfo): string {
  if (source.width !== undefined && source.height !== undefined) return `${source.width} × ${source.height}`;
  return source.type === 'screen' ? 'Весь монитор' : 'Только выбранное окно';
}

export function SourcePicker({ busy = false, includeAudio, onAudio, onCancel, onSelect, platform, sources }: SourcePickerProps): React.JSX.Element {
  const initialTab: SourceTab = sources.some((source) => source.type === 'screen') ? 'screen' : 'window';
  const initialSource = sources.find((source) => source.type === initialTab) ?? sources[0];
  const [tab, setTab] = useState<SourceTab>(initialTab);
  const [selectedId, setSelectedId] = useState(initialSource?.id ?? '');
  const dialogRef = useRef<HTMLElement>(null);
  const visibleSources = useMemo(() => sources.filter((source) => source.type === tab), [sources, tab]);
  const selectedSource = sources.find((source) => source.id === selectedId) ?? null;
  const audioAvailable = selectedSource?.audioAvailable === true;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [busy, onCancel]);

  useEffect(() => {
    if (includeAudio && !audioAvailable) onAudio(false);
  }, [audioAvailable, includeAudio, onAudio]);

  const changeTab = (nextTab: SourceTab): void => {
    setTab(nextTab);
    const firstSource = sources.find((source) => source.type === nextTab);
    setSelectedId(firstSource?.id ?? '');
    if (firstSource?.audioAvailable !== true) onAudio(false);
  };

  const chooseSource = (source: DesktopSourceInfo): void => {
    setSelectedId(source.id);
    if (!source.audioAvailable) onAudio(false);
  };

  const selectedIndex = selectedSource === null
    ? -1
    : sources.filter((source) => source.type === selectedSource.type).findIndex((source) => source.id === selectedSource.id);
  const selectedTitle = selectedSource === null ? null : sourceTitle(selectedSource, selectedIndex);
  const selectedDetails = selectedSource === null ? null : [
    selectedSource.type === 'screen' ? 'весь экран' : 'окно приложения',
    sourceDescription(selectedSource),
    includeAudio && audioAvailable ? 'со звуком' : 'без звука',
    'защита от дублирования включена',
  ].join(' · ');

  return (
    <div className="vui-share-picker__backdrop">
      <section aria-labelledby="screen-share-title" aria-modal="true" className="vui-share-picker" ref={dialogRef} role="dialog">
        <header className="vui-share-picker__header">
          <div><span>Демонстрация экрана</span><h1 id="screen-share-title">Что показать?</h1><p>Выберите монитор целиком или отдельное окно приложения.</p></div>
          <IconButton disabled={busy} icon="close" label="Закрыть выбор источника" onClick={onCancel} type="button" />
        </header>

        <SegmentedControl
          label="Тип источника"
          onChange={changeTab}
          options={[
            { value: 'screen', label: 'Весь экран', disabled: !sources.some((source) => source.type === 'screen') },
            { value: 'window', label: 'Окно приложения', disabled: !sources.some((source) => source.type === 'window') },
          ]}
          value={tab}
        />

        <div className="vui-share-picker__sources">
          {visibleSources.length === 0 ? <div className="vui-share-picker__empty"><Icon name="warning" size={28} /><strong>Источники не найдены</strong><span>Проверьте разрешение на запись экрана и обновите список.</span></div> : null}
          {visibleSources.map((source, index) => {
            const selected = source.id === selectedId;
            const title = sourceTitle(source, index);
            return (
              <button
                aria-label={`${title}, ${sourceDescription(source)}`}
                aria-pressed={selected}
                className="vui-share-source"
                data-selected={selected || undefined}
                disabled={busy}
                key={source.id}
                onClick={() => chooseSource(source)}
                title={title}
                type="button"
              >
                <span className="vui-share-source__preview"><img alt="" src={source.thumbnailDataUrl} /><Badge tone={selected ? 'primary' : 'neutral'}>{source.type === 'screen' ? `Экран ${index + 1}` : 'Приложение'}</Badge>{selected ? <span className="vui-share-source__check"><Icon name="check" size={16} /></span> : null}</span>
                <span className="vui-share-source__caption">{source.appIconDataUrl === undefined ? <span className="vui-share-source__fallback"><Icon name="screen" size={18} /></span> : <img alt="" src={source.appIconDataUrl} />}<span><strong>{title}</strong><small>{source.displayName || sourceDescription(source)}</small></span></span>
              </button>
            );
          })}
        </div>

        <div className="vui-share-picker__options">
          <RadioGroup
            label="Звук демонстрации"
            name="screen-share-audio"
            onChange={(value) => onAudio(value === 'with-audio')}
            options={[
              { value: 'with-audio', label: 'Передавать звук приложения', description: audioAvailable ? 'Зрители смогут регулировать и отключать его.' : platform === 'win32' ? 'Для этого источника звук недоступен.' : 'Системный звук доступен только в приложении для Windows.', disabled: !audioAvailable },
              { value: 'silent', label: 'Без звука', description: 'Передавать только изображение.' },
            ]}
            value={includeAudio && audioAvailable ? 'with-audio' : 'silent'}
          />
          <Checkbox checked disabled description="Голоса участников Ватрушки исключаются из системного аудио, чтобы не возникало эха." label="Не дублировать голоса участников" readOnly />
        </div>

        <footer className="vui-share-picker__footer">
          <div className="vui-share-picker__summary"><Icon name={includeAudio && audioAvailable ? 'volume' : 'volumeOff'} size={20} /><span><strong>{selectedTitle ?? 'Источник не выбран'}</strong><small>{selectedDetails ?? 'Выберите источник для начала демонстрации.'}</small></span></div>
          <div><Button disabled={busy} onClick={onCancel} type="button" variant="quiet">Отмена</Button><Button disabled={selectedSource === null} icon="screen" loading={busy} onClick={() => { if (selectedSource !== null) onSelect(selectedSource); }} type="button">Начать демонстрацию</Button></div>
        </footer>
      </section>
    </div>
  );
}
