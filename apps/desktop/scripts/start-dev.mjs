/* global URL, process */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const electronViteCli = fileURLToPath(
  new URL("../../../node_modules/electron-vite/bin/electron-vite.js", import.meta.url),
);
const environment = { ...process.env };

// Playwright and some debugging tools set this flag to make Electron behave as
// plain Node.js. A desktop dev session must never inherit that behaviour.
delete environment.ELECTRON_RUN_AS_NODE;

// Keep local UI work isolated from production CORS. Requests to this origin are
// proxied by electron-vite to the target configured in electron.vite.config.ts.
// Electron main also performs the password-login completion and session refresh.
// On Windows `localhost` can resolve to IPv6 while the Vite proxy is available
// only through IPv4, leaving the renderer connected but auth requests offline.
// Keep the local renderer proxy on one explicit loopback address.
environment.VITE_PUBLIC_API_BASE_URL ??= "http://127.0.0.1:5174";

const child = spawn(
  process.execPath,
  [electronViteCli, "dev", ...process.argv.slice(2)],
  { env: environment, stdio: "inherit" },
);

child.once("exit", (code, signal) => {
  if (signal !== null) process.kill(process.pid, signal);
  process.exitCode = code ?? 1;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}
