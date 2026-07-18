import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { Icon, type IconName } from './Icon';
import './primitives.css';

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

type ControlSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  size?: ControlSize;
  loading?: boolean;
  icon?: IconName;
}

export function Button({ children, className, disabled, icon, loading = false, size = 'md', variant = 'primary', ...props }: ButtonProps): React.JSX.Element {
  return (
    <button
      {...props}
      aria-busy={loading}
      className={cx('vui-button', `vui-button--${variant}`, `vui-control--${size}`, className)}
      disabled={disabled === true || loading}
    >
      {loading ? <span aria-hidden="true" className="vui-spinner" /> : icon === undefined ? null : <Icon name={icon} size={18} />}
      <span>{children}</span>
    </button>
  );
}

export interface FilePickerProps {
  accept?: string;
  disabled?: boolean;
  label: string;
  selectedName?: string | null | undefined;
  onFile(file: File): void;
}

export function FilePicker({ accept, disabled = false, label, onFile, selectedName = null }: FilePickerProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="vui-file-picker">
      <span>{label}</span>
      <div>
        <Button disabled={disabled} onClick={() => inputRef.current?.click()} size="sm" type="button" variant="secondary">Выбрать файл</Button>
        <small title={selectedName ?? undefined}>{selectedName ?? 'Файл не выбран'}</small>
      </div>
      <input aria-label={`${label}: файл`} accept={accept} disabled={disabled} onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = ''; }} ref={inputRef} tabIndex={-1} type="file" />
    </div>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children' | 'size'> {
  label: string;
  icon: IconName;
  size?: ControlSize;
  active?: boolean;
}

export function IconButton({ active = false, className, icon, label, size = 'md', ...props }: IconButtonProps): React.JSX.Element {
  return (
    <button {...props} aria-label={label} className={cx('vui-icon-button', `vui-control--${size}`, className)} data-active={active || undefined}>
      <Icon name={icon} size={size === 'sm' ? 16 : 20} />
    </button>
  );
}

interface FieldFrameProps {
  id: string;
  label?: string | undefined;
  hint?: string | undefined;
  error?: string | undefined;
  children: ReactNode;
}

function FieldFrame({ children, error, hint, id, label }: FieldFrameProps): React.JSX.Element {
  const description = error ?? hint;
  return (
    <div className="vui-field">
      {label === undefined ? null : <label className="vui-field__label" htmlFor={id}>{label}</label>}
      {children}
      {description === undefined ? null : <div className={cx('vui-field__message', error !== undefined && 'vui-field__message--error')} id={`${id}-message`}>{description}</div>}
    </div>
  );
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  leadingIcon?: IconName;
  size?: ControlSize;
}

export function Input({ className, error, hint, id: providedId, label, leadingIcon, size = 'md', ...props }: InputProps): React.JSX.Element {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  return (
    <FieldFrame error={error} hint={hint} id={id} label={label}>
      <span className={cx('vui-input-frame', error !== undefined && 'vui-input-frame--error', props.disabled === true && 'vui-input-frame--disabled')}>
        {leadingIcon === undefined ? null : <Icon name={leadingIcon} size={18} />}
        <input
          {...props}
          aria-describedby={error === undefined && hint === undefined ? undefined : `${id}-message`}
          aria-invalid={error === undefined ? undefined : true}
          className={cx('vui-input', `vui-control--${size}`, className)}
          id={id}
        />
      </span>
    </FieldFrame>
  );
}

export interface PasswordInputProps extends Omit<InputProps, 'type' | 'leadingIcon'> {
  showLabel?: string;
  hideLabel?: string;
}

export function PasswordInput({ hideLabel = 'Скрыть пароль', showLabel = 'Показать пароль', ...props }: PasswordInputProps): React.JSX.Element {
  const [visible, setVisible] = useState(false);
  return (
    <div className="vui-input-with-action">
      <Input {...props} type={visible ? 'text' : 'password'} />
      <IconButton
        className="vui-input-with-action__button"
        disabled={props.disabled}
        icon={visible ? 'eyeOff' : 'eye'}
        label={visible ? hideLabel : showLabel}
        onClick={() => setVisible((current) => !current)}
        size="sm"
        type="button"
      />
    </div>
  );
}

export interface SearchInputProps extends Omit<InputProps, 'defaultValue' | 'leadingIcon' | 'onChange' | 'type' | 'value'> {
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  clearLabel?: string;
}

export function SearchInput({ clearLabel = 'Очистить поиск', defaultValue = '', onValueChange, ...props }: SearchInputProps): React.JSX.Element {
  const [value, setValue] = useState(defaultValue);
  return (
    <div className="vui-input-with-action">
      <Input
        {...props}
        leadingIcon="search"
        onChange={(event) => {
          setValue(event.target.value);
          onValueChange?.(event.target.value);
        }}
        type="search"
        value={value}
      />
      {value.length === 0 ? null : (
        <IconButton
          className="vui-input-with-action__button"
          icon="close"
          label={clearLabel}
          onClick={() => {
            setValue('');
            onValueChange?.('');
          }}
          size="sm"
          type="button"
        />
      )}
    </div>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'defaultValue' | 'onChange' | 'value'> {
  label?: string;
  hint?: string;
  error?: string;
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (event: { target: { value: string } }) => void;
  onValueChange?: (value: string) => void;
}

export function Select({ className, defaultValue, disabled = false, error, hint, id: providedId, label, onChange, onValueChange, options, value, ...props }: SelectProps): React.JSX.Element {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const listboxId = `${id}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? options.find((option) => option.disabled !== true)?.value ?? '');
  const selectedValue = value ?? uncontrolledValue;
  const selected = options.find((option) => option.value === selectedValue) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const commit = (nextValue: string): void => {
    if (value === undefined) setUncontrolledValue(nextValue);
    onValueChange?.(nextValue);
    onChange?.({ target: { value: nextValue } });
    setOpen(false);
  };

  const move = (direction: 1 | -1): void => {
    const enabled = options.filter((option) => option.disabled !== true);
    if (enabled.length === 0) return;
    const currentIndex = enabled.findIndex((option) => option.value === selectedValue);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + enabled.length) % enabled.length;
    const next = enabled[nextIndex];
    if (next) commit(next.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) setOpen(true);
      else move(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <FieldFrame error={error} hint={hint} id={id} label={label}>
      <div className={cx('vui-select-root', className)} ref={rootRef}>
        <button
          {...props}
          aria-controls={listboxId}
          aria-describedby={error === undefined && hint === undefined ? undefined : `${id}-message`}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-invalid={error === undefined ? undefined : true}
          className={cx('vui-select-frame', error !== undefined && 'vui-input-frame--error')}
          disabled={disabled}
          id={id}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={handleKeyDown}
          type="button"
        >
          <span className="vui-select__value" title={selected?.label}>{selected?.label ?? 'Нет доступных вариантов'}</span>
          <Icon name="chevronDown" size={18} />
        </button>
        {open ? <div aria-label={label} className="vui-select-menu" id={listboxId} role="listbox">{options.map((option) => (
          <button
            aria-selected={option.value === selectedValue}
            disabled={option.disabled}
            key={option.value}
            onClick={() => commit(option.value)}
            role="option"
            title={option.label}
            type="button"
          >
            <span>{option.label}</span>{option.value === selectedValue ? <Icon name="check" size={16} /> : null}
          </button>
        ))}</div> : null}
      </div>
    </FieldFrame>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  label: string;
  options: Array<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}

export function SegmentedControl<T extends string>({ disabled = false, label, onChange, options, value }: SegmentedControlProps<T>): React.JSX.Element {
  return (
    <div aria-label={label} className="vui-segmented" role="group">
      {options.map((option) => (
        <button
          aria-pressed={option.value === value}
          className="vui-segmented__item"
          disabled={disabled || option.disabled === true}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  label: string;
  description?: string;
  indeterminate?: boolean;
}

export function Checkbox({ className, description, indeterminate = false, label, ...props }: CheckboxProps): React.JSX.Element {
  return (
    <label className={cx('vui-choice', props.disabled === true && 'vui-choice--disabled', className)}>
      <input {...props} className="vui-choice__native" type="checkbox" />
      <span aria-hidden="true" className="vui-choice__box">{indeterminate ? <Icon name="minus" size={14} /> : <Icon name="check" size={14} />}</span>
      <span className="vui-choice__copy"><strong>{label}</strong>{description === undefined ? null : <small>{description}</small>}</span>
    </label>
  );
}

export interface RadioOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface RadioGroupProps {
  label: string;
  name: string;
  options: RadioOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function RadioGroup({ disabled = false, label, name, onChange, options, value }: RadioGroupProps): React.JSX.Element {
  return (
    <fieldset className="vui-radio-group">
      <legend>{label}</legend>
      {options.map((option) => (
        <label className={cx('vui-choice', (disabled || option.disabled === true) && 'vui-choice--disabled')} key={option.value}>
          <input checked={value === option.value} className="vui-choice__native" disabled={disabled || option.disabled === true} name={name} onChange={() => onChange(option.value)} type="radio" value={option.value} />
          <span aria-hidden="true" className="vui-choice__radio" />
          <span className="vui-choice__copy"><strong>{option.label}</strong>{option.description === undefined ? null : <small>{option.description}</small>}</span>
        </label>
      ))}
    </fieldset>
  );
}

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onChange'> {
  checked: boolean;
  label: string;
  description?: string;
  onCheckedChange: (checked: boolean) => void;
}

export function Switch({ checked, className, description, label, onCheckedChange, ...props }: SwitchProps): React.JSX.Element {
  return (
    <button {...props} aria-checked={checked} className={cx('vui-switch-row', className)} onClick={() => onCheckedChange(!checked)} role="switch" type="button">
      <span className="vui-choice__copy"><strong>{label}</strong>{description === undefined ? null : <small>{description}</small>}</span>
      <span aria-hidden="true" className="vui-switch"><span /></span>
    </button>
  );
}

export interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  label: string;
  valueLabel?: string;
}

export function Slider({ className, defaultValue, label, max = 100, min = 0, value, valueLabel, ...props }: SliderProps): React.JSX.Element {
  const numericValue = Number(value ?? defaultValue ?? min);
  const numericMin = Number(min);
  const numericMax = Number(max);
  const progress = ((numericValue - numericMin) / Math.max(numericMax - numericMin, 1)) * 100;
  return (
    <label className={cx('vui-slider', className)}>
      <span><strong>{label}</strong><output>{valueLabel ?? numericValue}</output></span>
      <input {...props} aria-label={label} defaultValue={defaultValue} max={max} min={min} style={{ '--slider-progress': `${progress}%` } as React.CSSProperties} type="range" value={value} />
    </label>
  );
}

export interface TooltipProps {
  content: string;
  children: ReactNode;
}

export function Tooltip({ children, content }: TooltipProps): React.JSX.Element {
  const id = useId();
  return <span aria-describedby={id} className="vui-tooltip-anchor">{children}<span className="vui-tooltip" id={id} role="tooltip">{content}</span></span>;
}

export interface PopoverProps {
  label: string;
  trigger: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function Popover({ children, defaultOpen = false, label, trigger }: PopoverProps): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && !anchorRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);
  return (
    <span className="vui-popover-anchor" ref={anchorRef}>
      <button aria-controls={id} aria-expanded={open} className="vui-popover-trigger" onClick={() => setOpen((current) => !current)} type="button">{trigger}</button>
      {open ? <span aria-label={label} className="vui-popover" id={id} role="dialog">{children}</span> : null}
    </span>
  );
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'founder';
}

export function Badge({ className, tone = 'neutral', ...props }: BadgeProps): React.JSX.Element {
  return <span {...props} className={cx('vui-badge', `vui-badge--${tone}`, className)} />;
}

export interface StatusDotProps extends HTMLAttributes<HTMLSpanElement> {
  status: 'online' | 'idle' | 'dnd' | 'offline' | 'streaming';
  label: string;
}

export function StatusDot({ className, label, status, ...props }: StatusDotProps): React.JSX.Element {
  return <span {...props} aria-label={label} className={cx('vui-status-dot', `vui-status-dot--${status}`, className)} role="img" />;
}

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  status?: StatusDotProps['status'];
}

export function Avatar({ className, name, size = 'md', src, status, ...props }: AvatarProps): React.JSX.Element {
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return (
    <span {...props} aria-label={name} className={cx('vui-avatar', `vui-avatar--${size}`, className)} role="img">
      {src === undefined ? <span aria-hidden="true">{initials}</span> : <img alt="" src={src} />}
      {status === undefined ? null : <StatusDot label={status} status={status} />}
    </span>
  );
}

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: number;
  max?: number;
}

export function Progress({ className, label, max = 100, value, ...props }: ProgressProps): React.JSX.Element {
  const percent = Math.min(100, Math.max(0, value / max * 100));
  return <div {...props} aria-label={label} aria-valuemax={max} aria-valuemin={0} aria-valuenow={value} className={cx('vui-progress', className)} role="progressbar"><span style={{ width: `${percent}%` }} /></div>;
}

export interface AudioLevelMeterProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: number;
  segments?: number;
}

export function AudioLevelMeter({ className, label, segments = 12, value, ...props }: AudioLevelMeterProps): React.JSX.Element {
  const activeCount = Math.round(Math.min(1, Math.max(0, value)) * segments);
  return (
    <div {...props} aria-label={label} aria-valuemax={1} aria-valuemin={0} aria-valuenow={value} className={cx('vui-audio-meter', className)} role="meter">
      {Array.from({ length: segments }, (_, index) => <span data-active={index < activeCount || undefined} key={index} />)}
    </div>
  );
}

export function Divider({ className, ...props }: HTMLAttributes<HTMLHRElement>): React.JSX.Element {
  return <hr {...props} className={cx('vui-divider', className)} />;
}

export interface SkeletonProps extends HTMLAttributes<HTMLSpanElement> {
  width?: string;
  height?: string;
  rounded?: boolean;
}

export function Skeleton({ className, height = '1em', rounded = false, width = '100%', ...props }: SkeletonProps): React.JSX.Element {
  return <span {...props} aria-hidden="true" className={cx('vui-skeleton', rounded && 'vui-skeleton--rounded', className)} style={{ height, width }} />;
}
