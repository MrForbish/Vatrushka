import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import type {
  ScreenAnnotationPoint,
  ScreenAnnotationStroke,
} from "./annotations";

interface Props {
  active: boolean;
  color: string;
  editable: boolean;
  size: number;
  strokes: ScreenAnnotationStroke[];
  videoRef: RefObject<HTMLVideoElement | null>;
  onStroke(stroke: ScreenAnnotationStroke): void;
}

interface ContentRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function contentRect(
  width: number,
  height: number,
  videoWidth: number,
  videoHeight: number,
): ContentRect {
  if (!videoWidth || !videoHeight) return { left: 0, top: 0, width, height };
  const scale = Math.min(width / videoWidth, height / videoHeight);
  const renderedWidth = videoWidth * scale;
  const renderedHeight = videoHeight * scale;
  return {
    left: (width - renderedWidth) / 2,
    top: (height - renderedHeight) / 2,
    width: renderedWidth,
    height: renderedHeight,
  };
}

function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: ScreenAnnotationStroke,
  rect: ContentRect,
): void {
  const first = stroke.points[0];
  if (!first) return;
  context.beginPath();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = stroke.color;
  context.lineWidth = stroke.size;
  context.moveTo(rect.left + first.x * rect.width, rect.top + first.y * rect.height);
  for (const point of stroke.points.slice(1))
    context.lineTo(rect.left + point.x * rect.width, rect.top + point.y * rect.height);
  context.stroke();
}

export function ScreenAnnotationCanvas({
  active,
  color,
  editable,
  onStroke,
  size,
  strokes,
  videoRef,
}: Props): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draftRef = useRef<ScreenAnnotationStroke | null>(null);

  const redraw = (): void => {
    const canvas = canvasRef.current;
    if (!canvas || navigator.userAgent.includes("jsdom")) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const video = videoRef.current;
    const rect = contentRect(width, height, video?.videoWidth ?? 0, video?.videoHeight ?? 0);
    for (const stroke of strokes) drawStroke(context, stroke, rect);
    if (draftRef.current) drawStroke(context, draftRef.current, rect);
  };

  useEffect(() => {
    redraw();
  }, [strokes, videoRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    return () => observer.disconnect();
  });

  const normalizedPoint = (event: ReactPointerEvent<HTMLCanvasElement>): ScreenAnnotationPoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    const video = videoRef.current;
    const rect = contentRect(bounds.width, bounds.height, video?.videoWidth ?? 0, video?.videoHeight ?? 0);
    const x = event.clientX - bounds.left - rect.left;
    const y = event.clientY - bounds.top - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
    return {
      x: Math.round((x / rect.width) * 100_000) / 100_000,
      y: Math.round((y / rect.height) * 100_000) / 100_000,
    };
  };

  const start = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!editable || !active || event.button !== 0) return;
    const point = normalizedPoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    draftRef.current = {
      id: crypto.randomUUID(),
      color,
      size,
      points: [point, point],
    };
    redraw();
  };

  const move = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const draft = draftRef.current;
    if (!draft || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const point = normalizedPoint(event);
    const previous = draft.points.at(-1);
    if (!point || (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.0015)) return;
    if (draft.points.length < 800) draft.points.push(point);
    redraw();
  };

  const finish = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const draft = draftRef.current;
    if (!draft) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    draftRef.current = null;
    if (draft.points.length >= 2) onStroke(draft);
    redraw();
  };

  return (
    <canvas
      aria-label="Аннотации поверх демонстрации"
      className="vui-room__annotation-canvas"
      data-active={editable && active}
      onPointerCancel={finish}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={finish}
      ref={canvasRef}
    />
  );
}
