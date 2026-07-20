import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { DesktopSourceInfo } from "@vatrushka/shared";

import { SourcePicker } from "./SourcePicker";

const sources: DesktopSourceInfo[] = [
  {
    id: "screen:1:0",
    name: "Экран 1",
    thumbnailDataUrl: "data:image/png;base64,",
    type: "screen",
    displayName: "Основной монитор",
    width: 2560,
    height: 1440,
    audioAvailable: true,
  },
  {
    id: "window:2:0",
    name: "Figma — Vatrushka",
    thumbnailDataUrl: "data:image/png;base64,",
    appIconDataUrl: "data:image/png;base64,",
    type: "window",
    audioAvailable: true,
  },
];

describe("screen share source picker", () => {
  it("separates screens and application windows and confirms the selected source with the default quality", async () => {
    const onSelect = vi.fn();
    render(
      <SourcePicker
        sources={sources}
        platform="win32"
        onSelect={onSelect}
        onCancel={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Экран 1, 2560 × 1440" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/1080p · 60 FPS · без звука/u)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Окно приложения" }),
    );
    expect(
      screen.queryByRole("button", { name: "Экран 1, 2560 × 1440" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", {
        name: "Figma — Vatrushka, Только выбранное окно",
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Начать демонстрацию" }),
    );
    expect(onSelect).toHaveBeenCalledWith(sources[1], "1080p60", false);
  });

  it("offers the 2560 by 1440 preset at 60 FPS", async () => {
    const onSelect = vi.fn();
    render(
      <SourcePicker
        sources={sources}
        platform="win32"
        onSelect={onSelect}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Качество демонстрации" }),
    );
    await userEvent.click(
      screen.getByRole("option", {
        name: "2560 × 1440 · 60 FPS — высокое качество",
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Начать демонстрацию" }),
    );

    expect(onSelect).toHaveBeenCalledWith(sources[0], "1440p60", false);
  });

  it("allows video-only sharing when system audio is unavailable", () => {
    render(
      <SourcePicker
        sources={[{ ...sources[0]!, audioAvailable: false }]}
        platform="win32"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Выбранный источник не предоставляет системный звук."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Начать демонстрацию" }),
    ).toBeEnabled();
  });

  it("blocks application audio when the channel role denies it", () => {
    render(
      <SourcePicker
        audioAllowed={false}
        sources={sources}
        platform="win32"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Ваша роль не разрешает передачу звука приложения."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Начать демонстрацию" }),
    ).toBeEnabled();
  });

  it("does not offer unsafe loopback when own-app exclusion is unsupported", () => {
    render(
      <SourcePicker
        audioProtectionAvailable={false}
        sources={sources}
        platform="win32"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        "Эта версия Windows не умеет безопасно исключать голоса участников из демонстрации.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Начать демонстрацию" }),
    ).toBeEnabled();
  });

  it("passes an explicit audio capability through typed IPC selection", async () => {
    const onSelect = vi.fn();
    render(
      <SourcePicker
        sources={sources}
        platform="win32"
        onSelect={onSelect}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: /Передавать системный звук/u }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Начать демонстрацию" }),
    );
    expect(onSelect).toHaveBeenCalledWith(sources[0], "1080p60", true);
  });

  it("closes when the empty backdrop is clicked", () => {
    const onCancel = vi.fn();
    const { container } = render(
      <SourcePicker
        sources={sources}
        platform="win32"
        onSelect={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.mouseDown(
      container.querySelector(".vui-share-picker__backdrop")!,
    );
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
