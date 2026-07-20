import { app } from "electron";
import log from "electron-log/main";
import electronUpdater, {
  type ProgressInfo,
  type UpdateInfo,
} from "electron-updater";

import type { DesktopUpdateState } from "@vatrushka/shared";

import {
  isUpdateCheckDue,
  UPDATE_CHECK_TIMEOUT_MS,
  UPDATE_INTERVAL_MS,
  UPDATE_RETRY_DELAY_MS,
  UPDATE_START_DELAY_MS,
} from "./updater-schedule.js";

const { autoUpdater } = electronUpdater;

export class DesktopUpdater {
  private state: DesktopUpdateState = {
    status: "idle",
    currentVersion: app.getVersion(),
  };
  private startTimer: NodeJS.Timeout | null = null;
  private interval: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private started = false;
  private lastCheckStartedAt: number | null = null;
  private lastCheckWasManual = false;

  constructor(private readonly publish: (state: DesktopUpdateState) => void) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    if (
      !app.isPackaged ||
      process.platform !== "win32" ||
      Boolean(process.env.PORTABLE_EXECUTABLE_FILE)
    ) {
      this.setState({
        status: "unsupported",
        currentVersion: app.getVersion(),
        message: app.isPackaged
          ? "Автообновление доступно в установленной Windows-версии."
          : "Автообновление отключено в режиме разработки.",
      });
      return;
    }

    autoUpdater.logger = log;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on("checking-for-update", this.onChecking);
    autoUpdater.on("update-available", this.onAvailable);
    autoUpdater.on("update-not-available", this.onNotAvailable);
    autoUpdater.on("download-progress", this.onProgress);
    autoUpdater.on("update-downloaded", this.onDownloaded);
    autoUpdater.on("error", this.onError);

    this.startTimer = setTimeout(() => {
      void this.checkIfDue();
    }, UPDATE_START_DELAY_MS);
    this.startTimer.unref();
    this.interval = setInterval(() => {
      void this.checkIfDue();
    }, UPDATE_INTERVAL_MS);
    this.interval.unref();
  }

  getState(): DesktopUpdateState {
    return { ...this.state };
  }

  async check(): Promise<void> {
    if (!this.started) this.start();
    await this.runCheck(true);
  }

  async checkIfDue(): Promise<void> {
    if (!this.started) this.start();
    if (!isUpdateCheckDue(this.lastCheckStartedAt)) return;
    await this.runCheck(false);
  }

  private async runCheck(manual: boolean): Promise<void> {
    if (
      this.state.status === "unsupported" ||
      this.state.status === "checking" ||
      this.state.status === "downloading" ||
      this.state.status === "ready"
    )
      return;
    this.lastCheckWasManual = manual;
    this.lastCheckStartedAt = Date.now();
    try {
      await withTimeout(autoUpdater.checkForUpdates(), UPDATE_CHECK_TIMEOUT_MS);
    } catch (error) {
      this.onError(
        error instanceof Error ? error : new Error("Unknown updater error"),
      );
    }
  }

  install(): void {
    if (this.state.status !== "ready") return;
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
  }

  dispose(): void {
    if (this.startTimer) clearTimeout(this.startTimer);
    if (this.interval) clearInterval(this.interval);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.startTimer = null;
    this.interval = null;
    this.retryTimer = null;
    autoUpdater.removeListener("checking-for-update", this.onChecking);
    autoUpdater.removeListener("update-available", this.onAvailable);
    autoUpdater.removeListener("update-not-available", this.onNotAvailable);
    autoUpdater.removeListener("download-progress", this.onProgress);
    autoUpdater.removeListener("update-downloaded", this.onDownloaded);
    autoUpdater.removeListener("error", this.onError);
  }

  private readonly onChecking = (): void => {
    this.setState({ status: "checking", currentVersion: app.getVersion() });
  };

  private readonly onAvailable = (info: UpdateInfo): void => {
    this.setState({
      status: "available",
      currentVersion: app.getVersion(),
      version: info.version,
    });
  };

  private readonly onNotAvailable = (info: UpdateInfo): void => {
    this.setState({
      status: "up-to-date",
      currentVersion: app.getVersion(),
      version: info.version,
    });
  };

  private readonly onProgress = (progress: ProgressInfo): void => {
    this.setState({
      status: "downloading",
      currentVersion: app.getVersion(),
      ...(this.state.version ? { version: this.state.version } : {}),
      percent: Math.max(0, Math.min(100, Math.round(progress.percent))),
    });
  };

  private readonly onDownloaded = (info: UpdateInfo): void => {
    this.setState({
      status: "ready",
      currentVersion: app.getVersion(),
      version: info.version,
      percent: 100,
    });
  };

  private readonly onError = (error: Error): void => {
    const failureKind = updateFailureKind(error);
    log.warn("Update check failed", { failureKind, manual: this.lastCheckWasManual, error });
    // Background checks are deliberately quiet when the device itself is
    // offline. A red updater notification in that case duplicates the global
    // connection state and tells the user nothing actionable.
    if (failureKind === "network" && !this.lastCheckWasManual) {
      this.setState({ status: "idle", currentVersion: app.getVersion() });
      this.scheduleRetry();
      return;
    }
    this.setState({
      status: "error",
      currentVersion: app.getVersion(),
      failureKind,
      message: updateFailureMessage(failureKind),
    });
    this.scheduleRetry();
  };

  private scheduleRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.runCheck(false);
    }, UPDATE_RETRY_DELAY_MS);
    this.retryTimer.unref();
  }

  private setState(state: DesktopUpdateState): void {
    if (JSON.stringify(this.state) === JSON.stringify(state)) return;
    this.state = state;
    this.publish({ ...state });
  }
}

function updateFailureKind(error: Error): "network" | "infrastructure" | "unknown" {
  const message = `${error.name} ${error.message}`.toLowerCase();
  if (/err_internet_disconnected|err_network_changed|err_name_not_resolved|err_connection|network|offline|timed out|timeout/u.test(message)) return "network";
  if (/\b(5\d\d|503|502|500)\b|update server|latest\.yml/u.test(message)) return "infrastructure";
  return "unknown";
}

function updateFailureMessage(kind: "network" | "infrastructure" | "unknown"): string {
  if (kind === "network") return "Нет подключения к интернету. Проверка обновлений возобновится автоматически.";
  if (kind === "infrastructure") return "Сервис обновлений Vatrushka временно недоступен. Повторите попытку позже.";
  return "Не удалось проверить или загрузить обновление. Повторите попытку позже.";
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeout: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Update check timed out")),
          timeoutMs,
        );
        timeout.unref();
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
