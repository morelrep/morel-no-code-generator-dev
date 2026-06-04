import { useCallback, useRef, useState } from "react";
import { authLogger } from "../lib/authLogger";
import { gatewayPost } from "../lib/workerClient";
import {
  DeviceCodeResponseSchema,
  DeviceTokenResponseSchema,
} from "../schemas/githubAuth.schema";
import type { DeviceFlowState } from "../types/githubAuth.types";

const INITIAL_STATE: DeviceFlowState = {
  status: "idle",
  userCode: null,
  verificationUri: null,
  expiresAt: null,
  interval: 5,
  error: null,
};

export function useDeviceFlow() {
  const [state, setState] = useState<DeviceFlowState>(INITIAL_STATE);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceCodeRef = useRef<string | null>(null);
  const intervalRef = useRef<number>(5);

  const stopPolling = useCallback(() => {
    if (pollingRef.current !== null) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    stopPolling();
    deviceCodeRef.current = null;
    intervalRef.current = 5;
    setState(INITIAL_STATE);
    authLogger.info("Device flow cancelled");
  }, [stopPolling]);

  /**
   * Called by the parent hook (useGitHubAuth) when a token is authorized.
   * onToken receives the raw access token and the method.
   */
  const start = useCallback(
    async (
      scopes: string[],
      onToken: (token: string, method: "device") => Promise<void>,
    ) => {
      authLogger.group("Device flow");
      setState(INITIAL_STATE);

      try {
        // Step 1: request device code
        setState((s) => ({ ...s, status: "requesting" }));
        authLogger.info("POST /github/device/code ...");

        const raw = await gatewayPost({
          path: "/github/device/code",
          body: { scopes },
        });
        const { deviceCode, userCode, verificationUri, expiresIn, interval } =
          DeviceCodeResponseSchema.parse(raw);

        deviceCodeRef.current = deviceCode;
        intervalRef.current = interval;

        const expiresAt = new Date(Date.now() + expiresIn * 1000);
        setState({
          status: "awaiting_user",
          userCode,
          verificationUri,
          expiresAt,
          interval,
          error: null,
        });
        authLogger.info(`User code: ${userCode} → ${verificationUri}`);

        // Step 2: poll for token
        const poll = async () => {
          if (!deviceCodeRef.current) return;

          try {
            const tokenRaw = await gatewayPost({
              path: "/github/device/token",
              body: {
                clientId: "", // worker uses env GITHUB_CLIENT_ID
                deviceCode: deviceCodeRef.current,
                grantType: "urn:ietf:params:oauth:grant-type:device_code",
              },
            });
            const tokenResponse = DeviceTokenResponseSchema.parse(tokenRaw);

            if (tokenResponse.status === "pending") {
              authLogger.debug("Device flow: pending");
              setState((s) => ({ ...s, status: "polling" }));
              pollingRef.current = setTimeout(
                poll,
                intervalRef.current * 1000,
              );
              return;
            }

            if (tokenResponse.status === "slow_down") {
              intervalRef.current +=
                tokenResponse.intervalIncrementSeconds;
              authLogger.debug(
                `Device flow: slow_down → interval now ${intervalRef.current}s`,
              );
              setState((s) => ({ ...s, interval: intervalRef.current }));
              pollingRef.current = setTimeout(
                poll,
                intervalRef.current * 1000,
              );
              return;
            }

            if (tokenResponse.status === "failed") {
              const isExpired = tokenResponse.error === "expired_token";
              const isDenied = tokenResponse.error === "access_denied";
              authLogger.error(
                `Device flow failed: ${tokenResponse.error}`,
              );
              setState((s) => ({
                ...s,
                status: isExpired
                  ? "expired"
                  : isDenied
                    ? "denied"
                    : "failed",
                error: isExpired
                  ? "Device code expired — restart the flow"
                  : isDenied
                    ? "Authorization denied on GitHub"
                    : `GitHub error: ${tokenResponse.error}`,
              }));
              return;
            }

            // authorized
            setState((s) => ({ ...s, status: "authorized", error: null }));
            authLogger.info(
              "Device flow: authorized — verifying token...",
            );
            await onToken(tokenResponse.accessToken, "device");
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Unknown error";
            authLogger.error(`Device flow poll error: ${message}`);
            setState((s) => ({ ...s, status: "failed", error: message }));
          }
        };

        setState((s) => ({ ...s, status: "polling" }));
        pollingRef.current = setTimeout(poll, intervalRef.current * 1000);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error";
        authLogger.error(`Device flow init error: ${message}`);
        setState((s) => ({ ...s, status: "failed", error: message }));
      } finally {
        authLogger.groupEnd();
      }
    },
    [],
  );

  return { state, start, cancel };
}
