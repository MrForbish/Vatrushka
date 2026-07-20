export const SCREEN_ANNOTATION_TOPIC = "vatrushka.screen-annotations.v1";

export interface ScreenAnnotationPoint {
  x: number;
  y: number;
}

export interface ScreenAnnotationStroke {
  id: string;
  color: string;
  size: number;
  points: ScreenAnnotationPoint[];
}

export type ScreenAnnotationMessage =
  | { type: "stroke"; stroke: ScreenAnnotationStroke }
  | { type: "undo" }
  | { type: "clear" };

const colors = new Set(["#22d3ee", "#8b5cf6", "#facc15", "#fb7185", "#f8fafc"]);
const decoder = new TextDecoder();
const encoder = new TextEncoder();
const maxPayloadBytes = 64 * 1024;
const maxPoints = 800;
const maxStrokes = 100;

export function encodeScreenAnnotationMessage(
  message: ScreenAnnotationMessage,
): Uint8Array<ArrayBuffer> {
  return encoder.encode(JSON.stringify(message));
}

export function parseScreenAnnotationMessage(
  payload: Uint8Array,
): ScreenAnnotationMessage | null {
  if (payload.byteLength === 0 || payload.byteLength > maxPayloadBytes) return null;
  try {
    const value: unknown = JSON.parse(decoder.decode(payload));
    if (!value || typeof value !== "object" || !("type" in value)) return null;
    if (value.type === "undo" || value.type === "clear") return { type: value.type };
    if (value.type !== "stroke" || !("stroke" in value)) return null;
    const stroke = sanitizeScreenAnnotationStroke(value.stroke);
    return stroke ? { type: "stroke", stroke } : null;
  } catch {
    return null;
  }
}

export function sanitizeScreenAnnotationStroke(
  value: unknown,
): ScreenAnnotationStroke | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ScreenAnnotationStroke>;
  if (
    typeof candidate.id !== "string" ||
    candidate.id.length < 1 ||
    candidate.id.length > 80 ||
    typeof candidate.color !== "string" ||
    !colors.has(candidate.color.toLowerCase()) ||
    typeof candidate.size !== "number" ||
    !Number.isFinite(candidate.size) ||
    candidate.size < 1 ||
    candidate.size > 16 ||
    !Array.isArray(candidate.points) ||
    candidate.points.length < 2 ||
    candidate.points.length > maxPoints
  )
    return null;

  const points: ScreenAnnotationPoint[] = [];
  for (const point of candidate.points) {
    if (!point || typeof point !== "object") return null;
    const { x, y } = point as Partial<ScreenAnnotationPoint>;
    if (
      typeof x !== "number" ||
      typeof y !== "number" ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < 0 ||
      x > 1 ||
      y < 0 ||
      y > 1
    )
      return null;
    points.push({ x, y });
  }
  return {
    id: candidate.id,
    color: candidate.color.toLowerCase(),
    size: candidate.size,
    points,
  };
}

export function applyScreenAnnotationMessage(
  strokes: ScreenAnnotationStroke[],
  message: ScreenAnnotationMessage,
): ScreenAnnotationStroke[] {
  if (message.type === "clear") return [];
  if (message.type === "undo") return strokes.slice(0, -1);
  if (strokes.some((stroke) => stroke.id === message.stroke.id)) return strokes;
  return [...strokes, message.stroke].slice(-maxStrokes);
}
