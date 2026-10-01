"use client";

import { useId } from "react";
import { useEnvironment } from "../../lib/context/EnvironmentContext";
import { ENVIRONMENT_MODES, NETWORKS, isEnvironmentMode } from "../../lib/env/networks";

/**
 * Header mode selector. A native <select> on purpose: fully keyboard/screen
 * reader accessible and a proper picker on phones. It stays controlled by
 * the *applied* mode — choosing mainnet only opens the confirmation; the
 * select doesn't change until the switch actually happens.
 */
export function EnvironmentSelector() {
  const { mode, network, requestSwitch } = useEnvironment();
  const id = useId();

  return (
    <div data-tour="env-selector" style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <label htmlFor={id} className="sr-only">Environment</label>
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: network.color, flexShrink: 0 }} />
      <select
        id={id}
        data-testid="env-selector"
        className="tap env-select"
        value={mode}
        onChange={e => {
          if (isEnvironmentMode(e.target.value)) requestSwitch(e.target.value);
        }}
        style={{ color: network.color, borderColor: network.color }}
      >
        {ENVIRONMENT_MODES.map(m => (
          <option key={m} value={m}>
            {NETWORKS[m].shortLabel}{NETWORKS[m].realFunds ? " (real funds)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
