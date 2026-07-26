import { readFile } from "node:fs/promises";
import process from "node:process";
import { URL } from "node:url";

import { resolveDesktopDeliveryConfig } from "./scripts/desktop-delivery-config.mjs";

const packageJson = JSON.parse(
  await readFile(new URL("./package.json", import.meta.url), "utf8"),
);

const delivery = resolveDesktopDeliveryConfig({
  apiBaseUrl: process.env.VITE_PUBLIC_API_BASE_URL,
  updateFeed: process.env.VATRUSHKA_UPDATE_FEED,
  channel: process.env.VATRUSHKA_DESKTOP_CHANNEL,
  buildNumber: process.env.VATRUSHKA_DESKTOP_BUILD_NUMBER,
  baseVersion: packageJson.version,
});

const baseBuild = packageJson.build;

export default {
  ...baseBuild,
  appId: delivery.appId,
  productName: delivery.productName,
  extraMetadata: {
    ...baseBuild.extraMetadata,
    name: delivery.appName,
    productName: delivery.productName,
    version: delivery.version,
  },
  nsis: {
    ...baseBuild.nsis,
    artifactName: `${delivery.artifactPrefix}-Setup-${delivery.version}-\${arch}.\${ext}`,
  },
  portable: {
    ...baseBuild.portable,
    artifactName: `${delivery.artifactPrefix}-Portable-${delivery.version}-\${arch}.\${ext}`,
  },
  protocols: [
    {
      name: `Приглашение в ${delivery.productName}`,
      schemes: [delivery.protocol],
    },
  ],
};
