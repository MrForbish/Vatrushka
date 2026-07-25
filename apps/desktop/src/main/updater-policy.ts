export function desktopUpdatesAreEnabled(input: {
  isPackaged: boolean;
  platform: NodeJS.Platform;
  isPortable: boolean;
  buildEnabled: boolean;
}): boolean {
  return input.isPackaged && input.platform === "win32" && !input.isPortable && input.buildEnabled;
}
