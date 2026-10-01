"use client";

import { useBackendData } from "../context/BackendDataContext";
import { useSpotFeedContext } from "../context/SpotFeedContext";
import { useWalletStore } from "../store/wallet";
import { useHydrated } from "../useHydrated";
import { useAlertProducer, useExpiryProducer, useFeedProducer, useSessionProducer } from "./producers";

/** Mounted once at the root, inside the data providers it reads from. */
export function NotificationProducers() {
  const hydrated = useHydrated();
  const { alerts, positions } = useBackendData();
  const { status } = useSpotFeedContext();
  const token = useWalletStore(s => s.token);
  const address = useWalletStore(s => s.address);
  useAlertProducer(alerts);
  useExpiryProducer(positions);
  useSessionProducer(hydrated ? token : null, hydrated ? address : null);
  useFeedProducer(status);
  return null;
}
