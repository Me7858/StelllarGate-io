"use client";

import dynamic from "next/dynamic";
import { useEnvironment } from "../../lib/context/EnvironmentContext";

const ModeSwitchDialog = dynamic(() => import("./ModeSwitchDialog").then(m => m.ModeSwitchDialog), { ssr: false });

/** Loads the mode-switch dialog's code only once a switch is actually pending. */
export function ModeSwitchDialogLoader() {
  const { pendingSwitch } = useEnvironment();
  return pendingSwitch ? <ModeSwitchDialog /> : null;
}
