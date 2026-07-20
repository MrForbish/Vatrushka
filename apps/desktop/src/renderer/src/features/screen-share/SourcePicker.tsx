import { useEffect, useMemo, useRef, useState } from "react";

import type { DesktopSourceInfo } from "@vatrushka/shared";

import {
  Badge,
  Button,
  Icon,
  IconButton,
  SegmentedControl,
  Select,
} from "../../ui";
import "./source-picker.css";

type SourceTab = DesktopSourceInfo["type"];
export type ScreenShareQuality = "1080p60" | "1440p60";

export interface SourcePickerProps {
  sources: DesktopSourceInfo[];
  busy?: boolean;
  onSelect(
    source: DesktopSourceInfo,
    quality: ScreenShareQuality,
    includeAudio: boolean,
  ): void;
  onCancel(): void;
  platform?: string;
  audioAllowed?: boolean;
  audioProtectionAvailable?: boolean;
}

function sourceTitle(source: DesktopSourceInfo, index: number): string {
  if (source.name.trim().length > 0) return source.name;
  return source.type === "screen" ? `Экран ${index + 1}` : "Окно без названия";
}

function sourceDescription(source: DesktopSourceInfo): string {
  if (source.width !== undefined && source.height !== undefined)
    return `${source.width} × ${source.height}`;
  return source.type === "screen" ? "Весь монитор" : "Только выбранное окно";
}

export function SourcePicker({
  audioAllowed = true,
  audioProtectionAvailable = true,
  busy = false,
  onCancel,
  onSelect,
  platform = "win32",
  sources,
}: SourcePickerProps): React.JSX.Element {
  const initialTab: SourceTab = sources.some(
    (source) => source.type === "screen",
  )
    ? "screen"
    : "window";
  const initialSource =
    sources.find((source) => source.type === initialTab) ?? sources[0];
  const [tab, setTab] = useState<SourceTab>(initialTab);
  const [selectedId, setSelectedId] = useState(initialSource?.id ?? "");
  const [quality, setQuality] = useState<ScreenShareQuality>("1080p60");
  const [includeAudio, setIncludeAudio] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const visibleSources = useMemo(
    () => sources.filter((source) => source.type === tab),
    [sources, tab],
  );
  const selectedSource =
    sources.find((source) => source.id === selectedId) ?? null;
  const audioUnavailableReason =
    selectedSource?.audioAvailable === false
      ? "Выбранный источник не предоставляет системный звук."
      : platform !== "win32"
        ? "Безопасная передача системного звука сейчас поддерживается только в приложении для Windows."
        : !audioAllowed
          ? "Ваша роль не разрешает передачу звука приложения."
          : !audioProtectionAvailable
            ? "Эта версия Windows не умеет безопасно исключать голоса участников из демонстрации."
            : null;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel]);

  const changeTab = (nextTab: SourceTab): void => {
    setTab(nextTab);
    setSelectedId(sources.find((source) => source.type === nextTab)?.id ?? "");
  };
  const selectedIndex =
    selectedSource === null
      ? -1
      : sources
          .filter((source) => source.type === selectedSource.type)
          .findIndex((source) => source.id === selectedSource.id);
  const selectedTitle =
    selectedSource === null ? null : sourceTitle(selectedSource, selectedIndex);
  const selectedDetails =
    selectedSource === null
      ? null
      : [
          selectedSource.type === "screen" ? "весь экран" : "окно приложения",
          sourceDescription(selectedSource),
          quality === "1080p60" ? "1080p · 60 FPS" : "1440p · 60 FPS",
          includeAudio ? "со звуком, голоса Ватрушки исключены" : "без звука",
        ].join(" · ");

  return (
    <div
      className="vui-share-picker__backdrop"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        aria-labelledby="screen-share-title"
        aria-modal="true"
        className="vui-share-picker"
        ref={dialogRef}
        role="dialog"
      >
        <header className="vui-share-picker__header">
          <div>
            <span>Демонстрация экрана</span>
            <h1 id="screen-share-title">Что показать?</h1>
            <p>
              Выберите монитор или окно и отдельно решите, нужен ли системный
              звук.
            </p>
          </div>
          <IconButton
            disabled={busy}
            icon="close"
            label="Закрыть выбор источника"
            onClick={onCancel}
            type="button"
          />
        </header>
        <SegmentedControl
          label="Тип источника"
          onChange={changeTab}
          options={[
            {
              value: "screen",
              label: "Весь экран",
              disabled: !sources.some((source) => source.type === "screen"),
            },
            {
              value: "window",
              label: "Окно приложения",
              disabled: !sources.some((source) => source.type === "window"),
            },
          ]}
          value={tab}
        />
        <div className="vui-share-picker__sources">
          {visibleSources.length === 0 ? (
            <div className="vui-share-picker__empty">
              <Icon name="warning" size={28} />
              <strong>Источники не найдены</strong>
              <span>
                Проверьте разрешение на запись экрана и обновите список.
              </span>
            </div>
          ) : null}
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
                onClick={() => setSelectedId(source.id)}
                title={title}
                type="button"
              >
                <span className="vui-share-source__preview">
                  <img alt="" src={source.thumbnailDataUrl} />
                  <Badge tone={selected ? "primary" : "neutral"}>
                    {source.type === "screen"
                      ? `Экран ${index + 1}`
                      : "Приложение"}
                  </Badge>
                  {selected ? (
                    <span className="vui-share-source__check">
                      <Icon name="check" size={16} />
                    </span>
                  ) : null}
                </span>
                <span className="vui-share-source__caption">
                  {source.appIconDataUrl === undefined ? (
                    <span className="vui-share-source__fallback">
                      <Icon name="screen" size={18} />
                    </span>
                  ) : (
                    <img alt="" src={source.appIconDataUrl} />
                  )}
                  <span>
                    <strong>{title}</strong>
                    <small>
                      {source.displayName || sourceDescription(source)}
                    </small>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="vui-share-picker__options">
          <Select
            label="Качество демонстрации"
            onValueChange={(value) => setQuality(value as ScreenShareQuality)}
            options={[
              { value: "1080p60", label: "1080p · 60 FPS — рекомендуется" },
              { value: "1440p60", label: "2560 × 1440 · 60 FPS — высокое качество" },
            ]}
            value={quality}
          />
          <label className="vui-share-picker__audio">
            <input
              checked={includeAudio}
              disabled={audioUnavailableReason !== null}
              onChange={(event) => setIncludeAudio(event.target.checked)}
              type="checkbox"
            />
            <span>
              <strong>Передавать системный звук</strong>
              <small>
                {audioUnavailableReason ??
                  "Голоса участников Ватрушки будут исключены из захвата."}
              </small>
            </span>
          </label>
        </div>
        <footer className="vui-share-picker__footer">
          <div className="vui-share-picker__summary">
            <Icon name={includeAudio ? "volume" : "screen"} size={20} />
            <span>
              <strong>{selectedTitle ?? "Источник не выбран"}</strong>
              <small>
                {selectedDetails ??
                  "Выберите источник для начала демонстрации."}
              </small>
            </span>
          </div>
          <div>
            <Button
              disabled={busy}
              onClick={onCancel}
              type="button"
              variant="quiet"
            >
              Отмена
            </Button>
            <Button
              disabled={selectedSource === null}
              icon="screen"
              loading={busy}
              onClick={() => {
                if (selectedSource !== null)
                  onSelect(selectedSource, quality, includeAudio);
              }}
              type="button"
            >
              Начать демонстрацию
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}
