import { beforeEach, describe, expect, it, vi } from "vitest";
import { modeScopedStateStorage, namespacedKey, scopedStorage } from "./storage";
import { checkModeSwitch, getCurrentMode, resolveDeepLinkMode, useEnvironmentStore } from "./mode";
import { NETWORKS, walletNetworkMatches } from "./networks";
import { envIconSvg, prefixedTitle } from "./icon";
import { useWalletStore } from "../store/wallet";
import { applyModeSwitch } from "../context/EnvironmentContext";
import { ApiError, NOT_CONFIGURED_STATUS, apiBaseUrl, apiGet, wsUrl } from "../api/client";

beforeEach(() => {
  useEnvironmentStore.setState({ mode: "paper" });
  useWalletStore.setState({ token: null, address: null, status: "idle", network: null });
});

describe("storage namespaces", () => {
  it("prefixes keys with the mode", () => {
    expect(namespacedKey("mainnet", "wallet")).toBe("zenith:mainnet:wallet");
  });

  it("isolates values between modes", () => {
    scopedStorage("paper").setItem("wallet", "paper-token");
    scopedStorage("mainnet").setItem("wallet", "mainnet-token");
    expect(scopedStorage("paper").getItem("wallet")).toBe("paper-token");
    expect(scopedStorage("mainnet").getItem("wallet")).toBe("mainnet-token");
    expect(scopedStorage("testnet").getItem("wallet")).toBeNull();
    scopedStorage("paper").removeItem("wallet");
    expect(scopedStorage("mainnet").getItem("wallet")).toBe("mainnet-token");
  });

  it("keys() only lists the mode's own keys", () => {
    localStorage.clear();
    scopedStorage("paper").setItem("a", "1");
    scopedStorage("testnet").setItem("b", "2");
    localStorage.setItem("unrelated", "x");
    expect(scopedStorage("paper").keys()).toEqual(["a"]);
    expect(scopedStorage("testnet").keys()).toEqual(["b"]);
  });

  it("zustand storage follows the active mode on every access", () => {
    let mode: "paper" | "mainnet" = "paper";
    const storage = modeScopedStateStorage(() => mode);
    storage.setItem("wallet", "p");
    mode = "mainnet";
    expect(storage.getItem("wallet")).toBeNull();
    storage.setItem("wallet", "m");
    mode = "paper";
    expect(storage.getItem("wallet")).toBe("p");
  });

  it("survives storage that throws", () => {
    const throwing = () => ({ getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } }) as unknown as Storage;
    const s = scopedStorage("paper", throwing);
    expect(s.getItem("x")).toBeNull();
    expect(() => s.setItem("x", "1")).not.toThrow();
  });
});

describe("wallet session isolation across a mode switch", () => {
  it("never carries a token from one mode into another", async () => {
    useWalletStore.setState({ token: "paper-session", address: "GABC" });
    expect(localStorage.getItem("zenith:paper:wallet")).toContain("paper-session");

    applyModeSwitch("testnet");
    expect(getCurrentMode()).toBe("testnet");
    expect(useWalletStore.getState().token).toBeNull();
    expect(localStorage.getItem("zenith:testnet:wallet") ?? "").not.toContain("paper-session");

    useWalletStore.setState({ token: "testnet-session" });
    applyModeSwitch("paper");
    await useWalletStore.persist.rehydrate();
    expect(useWalletStore.getState().token).toBe("paper-session");
    expect(localStorage.getItem("zenith:paper:wallet")).not.toContain("testnet-session");
  });
});

describe("API base URL per mode", () => {
  it("uses the active mode's backend", () => {
    expect(apiBaseUrl()).toBe(NETWORKS.paper.apiUrl);
    expect(wsUrl("/x")).toBe(`${NETWORKS.paper.apiUrl!.replace(/^http/, "ws")}/x`);
  });

  it("refuses to fall back to another mode's backend when unconfigured", async () => {
    useEnvironmentStore.setState({ mode: "mainnet" });
    expect(NETWORKS.mainnet.apiUrl).toBeNull(); // no env var set in tests
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(apiGet("/api/v1/spot")).rejects.toMatchObject({ status: NOT_CONFIGURED_STATUS });
    await expect(apiGet("/api/v1/spot")).rejects.toBeInstanceOf(ApiError);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(wsUrl("/x")).toBeNull();
  });
});

describe("mode switch guard", () => {
  it("switches between non-real-funds modes without confirmation", () => {
    expect(checkModeSwitch({ from: "paper", to: "testnet", walletConnected: false, walletNetwork: null }))
      .toEqual({ ok: true, needsConfirmation: false });
  });

  it("always requires confirmation for mainnet", () => {
    expect(checkModeSwitch({ from: "paper", to: "mainnet", walletConnected: false, walletNetwork: null }))
      .toEqual({ ok: true, needsConfirmation: true });
    expect(checkModeSwitch({ from: "testnet", to: "mainnet", walletConnected: true, walletNetwork: "PUBLIC" }))
      .toEqual({ ok: true, needsConfirmation: true });
  });

  it("refuses mainnet while a connected wallet is on another network", () => {
    const r = checkModeSwitch({ from: "paper", to: "mainnet", walletConnected: true, walletNetwork: "TESTNET" });
    expect(r.ok).toBe(false);
    expect("reason" in r && r.reason).toMatch(/Switch Freighter to PUBLIC/);
  });

  it("treats an unknown wallet network as a mismatch for network-bound modes", () => {
    expect(walletNetworkMatches("mainnet", null)).toBe(false);
    expect(walletNetworkMatches("testnet", "TESTNET")).toBe(true);
    expect(walletNetworkMatches("paper", null)).toBe(true);
  });
});

describe("deep links", () => {
  it("switches directly to safe modes", () => {
    expect(resolveDeepLinkMode("testnet", "paper")).toEqual({ action: "switch", mode: "testnet" });
    expect(resolveDeepLinkMode("paper", "mainnet")).toEqual({ action: "switch", mode: "paper" });
  });
  it("never auto-switches to mainnet", () => {
    expect(resolveDeepLinkMode("mainnet", "paper")).toEqual({ action: "prompt", mode: "mainnet" });
  });
  it("ignores junk and no-ops", () => {
    expect(resolveDeepLinkMode("prod", "paper")).toEqual({ action: "none" });
    expect(resolveDeepLinkMode(null, "paper")).toEqual({ action: "none" });
    expect(resolveDeepLinkMode("paper", "paper")).toEqual({ action: "none" });
  });
});

describe("title and favicon", () => {
  it("prefixes the title, replacing an old prefix", () => {
    expect(prefixedTitle("Zenith", "mainnet")).toBe("[MAINNET] Zenith");
    expect(prefixedTitle("[PAPER] Zenith", "testnet")).toBe("[TESTNET] Zenith");
  });
  it("draws each mode's icon in its own color", () => {
    expect(envIconSvg("mainnet")).toContain(NETWORKS.mainnet.color);
    expect(envIconSvg("testnet")).toContain(NETWORKS.testnet.color);
    expect(envIconSvg("paper")).toContain("stroke-dasharray");
  });
});
