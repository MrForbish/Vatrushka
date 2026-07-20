import { useEffect, useRef, useState } from "react";

import { Button, Input, Modal } from "../../../ui";

const viewportSize = 320;
const outputSize = 512;

interface ImageSize {
  width: number;
  height: number;
}

interface Offset {
  x: number;
  y: number;
}

export interface AvatarCropDialogProps {
  file: File | null;
  onCancel(): void;
  onConfirm(file: File): void;
}

function clampOffset(
  offset: Offset,
  image: ImageSize,
  scale: number,
): Offset {
  return {
    x: Math.max(
      (viewportSize - image.width * scale) / 2,
      Math.min((image.width * scale - viewportSize) / 2, offset.x),
    ),
    y: Math.max(
      (viewportSize - image.height * scale) / 2,
      Math.min((image.height * scale - viewportSize) / 2, offset.y),
    ),
  };
}

async function renderCrop(
  image: HTMLImageElement,
  file: File,
  baseScale: number,
  zoom: number,
  offset: Offset,
): Promise<File> {
  const scale = baseScale * zoom;
  const sourceSize = viewportSize / scale;
  const sourceX = image.naturalWidth / 2 - offset.x / scale - sourceSize / 2;
  const sourceY =
    image.naturalHeight / 2 - offset.y / scale - sourceSize / 2;
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Не удалось подготовить изображение");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    outputSize,
    outputSize,
  );
  const mimeType = file.type === "image/png" ? "image/png" : "image/webp";
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(new Error("Не удалось обрезать изображение")),
      mimeType,
      0.92,
    );
  });
  const extension = mimeType === "image/png" ? "png" : "webp";
  return new File([blob], `avatar-${Date.now()}.${extension}`, {
    type: mimeType,
    lastModified: Date.now(),
  });
}

export function AvatarCropDialog({
  file,
  onCancel,
  onConfirm,
}: AvatarCropDialogProps): React.JSX.Element | null {
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(
    null,
  );
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setSource(null);
      return undefined;
    }
    const nextSource = URL.createObjectURL(file);
    setSource(nextSource);
    return () => URL.revokeObjectURL(nextSource);
  }, [file]);
  useEffect(() => {
    setImageSize(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setError(null);
  }, [file]);

  if (!file || !source) return null;
  const baseScale = imageSize
    ? Math.max(viewportSize / imageSize.width, viewportSize / imageSize.height)
    : 1;
  const scale = baseScale * zoom;
  const move = (next: Offset): void => {
    if (!imageSize) return;
    setOffset(clampOffset(next, imageSize, scale));
  };

  return (
    <Modal
      closeOnBackdrop={!busy}
      description="Переместите изображение и настройте масштаб. В круг попадёт только видимая область."
      footer={
        <>
          <Button disabled={busy} onClick={onCancel} variant="quiet">
            Отмена
          </Button>
          <Button
            disabled={!imageSize}
            loading={busy}
            onClick={() => {
              const image = imageRef.current;
              if (!image || !imageSize) return;
              setBusy(true);
              setError(null);
              void renderCrop(image, file, baseScale, zoom, offset)
                .then(onConfirm)
                .catch((caught: unknown) =>
                  setError(
                    caught instanceof Error
                      ? caught.message
                      : "Не удалось обрезать изображение",
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            Применить
          </Button>
        </>
      }
      onClose={() => {
        if (!busy) onCancel();
      }}
      open
      size="md"
      title="Выберите область аватара"
    >
      <div className="vui-avatar-crop">
        <div
          aria-label="Область кадрирования аватара"
          className="vui-avatar-crop__viewport"
          onKeyDown={(event) => {
            const step = event.shiftKey ? 10 : 2;
            if (event.key === "ArrowLeft") move({ ...offset, x: offset.x - step });
            else if (event.key === "ArrowRight") move({ ...offset, x: offset.x + step });
            else if (event.key === "ArrowUp") move({ ...offset, y: offset.y - step });
            else if (event.key === "ArrowDown") move({ ...offset, y: offset.y + step });
            else return;
            event.preventDefault();
          }}
          onPointerDown={(event) => {
            if (!imageSize) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            dragRef.current = {
              pointerId: event.pointerId,
              x: event.clientX,
              y: event.clientY,
            };
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            move({
              x: offset.x + event.clientX - drag.x,
              y: offset.y + event.clientY - drag.y,
            });
            dragRef.current = {
              pointerId: event.pointerId,
              x: event.clientX,
              y: event.clientY,
            };
          }}
          onPointerUp={(event) => {
            if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
          }}
          role="group"
          tabIndex={0}
        >
          <img
            alt="Предпросмотр кадрирования"
            draggable={false}
            onError={() => setError("Не удалось прочитать выбранное изображение")}
            onLoad={(event) =>
              setImageSize({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
            ref={imageRef}
            src={source}
            style={
              imageSize
                ? {
                    width: imageSize.width * baseScale,
                    height: imageSize.height * baseScale,
                    transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                  }
                : undefined
            }
          />
          <span aria-hidden="true" className="vui-avatar-crop__mask" />
        </div>
        <Input
          label="Масштаб"
          max={3}
          min={1}
          onChange={(event) => {
            const nextZoom = Number(event.target.value);
            setZoom(nextZoom);
            if (imageSize) {
              setOffset(
                clampOffset(offset, imageSize, baseScale * nextZoom),
              );
            }
          }}
          step={0.05}
          type="range"
          value={zoom}
        />
        <Button
          disabled={busy}
          onClick={() => {
            setZoom(1);
            setOffset({ x: 0, y: 0 });
          }}
          size="sm"
          variant="secondary"
        >
          Сбросить положение
        </Button>
        {error ? <p className="vui-avatar-crop__error">{error}</p> : null}
      </div>
    </Modal>
  );
}
