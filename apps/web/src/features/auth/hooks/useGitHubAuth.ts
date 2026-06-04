import { Octokit } from "@octokit/rest";
import { useCallback, useEffect, useRef, useState } from "react";
import { authLogger } from "../lib/authLogger";
import { initiateInstallationFlow, initiateOAuthFlow } from "../lib/oauthFlow";
import {
  GitHubPatSchema,
  GitHubUserSchema,
} from "../schemas/githubAuth.schema";
import type {
  AuthMethod,
  AuthState,
  GitHubUser,
} from "../types/githubAuth.types";
import { useDeviceFlow } from "./useDeviceFlow";

/**
 * GitHub App slug — read from the VITE_GITHUB_APP_SLUG env var.
 * Used to build installation URLs: https://github.com/apps/{slug}/installations/new
 * Differs per environment: dev/staging use "morel-studio-dev", production uses "morel-studio".
 */
export const GITHUB_APP_SLUG = import.meta.env.VITE_GITHUB_APP_SLUG as string;

const initialState: AuthState = {
  status: "disconnected",
  method: null,
  user: null,
  scopes: [],
  error: null,
  appInstalled: null,
};

type AuthFlowError = Error & {
  logMessage?: string;
};

type GitHubRequestError = Error & {
  status: number;
};

function createAuthFlowError(
  message: string,
  logMessage = message,
): AuthFlowError {
  const error = new Error(message) as AuthFlowError;
  error.logMessage = logMessage;
  return error;
}

function isGitHubRequestError(error: unknown): error is GitHubRequestError {
  return (
    error instanceof Error &&
    "status" in error &&
    typeof error.status === "number"
  );
}

function isNetworkError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("load failed")
  );
}

function getAuthErrorMessage(error: unknown): string {
  if (isGitHubRequestError(error)) {
    const message =
      error.status === 401
        ? "Token is invalid or revoked"
        : error.status === 403
          ? "Token lacks required permissions"
          : `GitHub API error (${error.status})`;

    authLogger.error(`GET /user -> ${error.status} ${error.message}`);
    return message;
  }

  if (error instanceof Error) {
    if (isNetworkError(error)) {
      authLogger.error(`Network error: ${error.message}`);
      return "Cannot reach GitHub - check your connection";
    }

    const authError = error as AuthFlowError;
    authLogger.error(authError.logMessage ?? error.message);
    return error.message;
  }

  authLogger.error("Unknown error", error);
  return "Unknown error";
}

export function useGitHubAuth() {
  const [state, setState] = useState<AuthState>(initialState);
  const [token, setToken] = useState<string | null>(null);
  const lastTokenRef = useRef<string | null>(null);
  const oauthPickupRan = useRef(false);

  const verify = useCallback(
    async (token: string, method: AuthMethod): Promise<GitHubUser> => {
      authLogger.debug("GET /user ...");

      const octokit = new Octokit({
        auth: token,
        headers: { "X-GitHub-Api-Version": "2026-03-10" },
      });
      const response = await octokit.rest.users.getAuthenticated();
      const userResult = GitHubUserSchema.safeParse(response.data);

      if (!userResult.success) {
        throw createAuthFlowError(
          "Unexpected response from GitHub",
          `Validation: ${userResult.error.issues
            .map((issue) => issue.message)
            .join(", ")}`,
        );
      }

      const scopes = (response.headers["x-oauth-scopes"] ?? "")
        .split(",")
        .map((scope) => scope.trim())
        .filter(Boolean);

      authLogger.info(
        `Authenticated as @${userResult.data.login} (scopes: ${
          scopes.join(", ") || "none"
        })`,
      );

      setState({
        status: "connected",
        method,
        user: userResult.data,
        scopes,
        error: null,
        appInstalled: null,
      });
      setToken(token);

      // After connecting, check whether the GitHub App is installed.
      // PAT tokens don't use the app — skip for those.
      if (method !== "pat") {
        try {
          const { data } =
            await octokit.rest.apps.listInstallationsForAuthenticatedUser();
          const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID as string;
          const installed = data.installations.some(
            (i) => i.app_slug === GITHUB_APP_SLUG || i.client_id === clientId,
          );
          authLogger.info(
            installed
              ? "GitHub App is installed on this account"
              : "GitHub App is NOT installed — redirecting to install",
          );
          setState((s) => ({ ...s, appInstalled: installed }));

          if (!installed) {
            // Auto-redirect to installation page. "Request user authorization
            // during installation" is enabled, so GitHub will redirect back
            // to the callback URL with a fresh code after installation.
            authLogger.info("Redirecting to GitHub App installation page...");
            initiateInstallationFlow({
              appSlug: GITHUB_APP_SLUG,
              method: "github-app",
            });
            // Page navigates away — no further code runs here
          }
        } catch (err) {
          authLogger.warn(
            "Could not check GitHub App installation status",
            err,
          );
        }
      }

      return userResult.data;
    },
    [],
  );

  const connectWithPat = useCallback(
    async (rawToken: string) => {
      authLogger.group("PAT flow");

      try {
        authLogger.info("PAT flow started");
        setState((current) => ({
          ...current,
          status: "connecting",
          method: "pat",
          error: null,
        }));

        const result = GitHubPatSchema.safeParse(rawToken);
        lastTokenRef.current = rawToken.trim();

        if (!result.success) {
          throw createAuthFlowError(
            result.error.issues[0]?.message ?? "Invalid token format",
          );
        }

        authLogger.info("Token received (type: bearer)");
        await verify(result.data, "pat");
      } catch (error) {
        const message = getAuthErrorMessage(error);
        setState((current) => ({
          ...current,
          status: "failed",
          error: message,
        }));
      } finally {
        authLogger.groupEnd();
      }
    },
    [verify],
  );

  const retry = useCallback(() => {
    if (lastTokenRef.current) {
      void connectWithPat(lastTokenRef.current);
    }
  }, [connectWithPat]);

  const deviceFlow = useDeviceFlow();

  const connectWithDeviceFlow = useCallback(
    async (scopes: string[] = ["repo", "workflow"]) => {
      setState((s) => ({
        ...s,
        status: "connecting",
        method: "device",
        error: null,
      }));
      await deviceFlow.start(scopes, async (token) => {
        await verify(token, "device");
      });
    },
    [deviceFlow, verify],
  );

  const connectWithOAuth = useCallback(
    async (method: "oauth" | "github-app") => {
      authLogger.info(`${method} flow: initiating redirect`);
      setState((s) => ({ ...s, status: "connecting", method, error: null }));

      if (method === "github-app") {
        // Redirect to installation page — combines install + authorize.
        initiateInstallationFlow({
          appSlug: GITHUB_APP_SLUG,
          method: "github-app",
        });
      } else {
        await initiateOAuthFlow({
          clientId: import.meta.env.VITE_GITHUB_CLIENT_ID as string,
          redirectUri: `${window.location.origin}${import.meta.env.BASE_URL}auth/callback`,
          scopes: ["repo", "workflow"],
          method,
        });
      }
      // Page navigates away — no further code runs here
    },
    [],
  );

  const disconnect = useCallback(() => {
    deviceFlow.cancel();
    authLogger.info("Disconnected");
    lastTokenRef.current = null;
    setToken(null);
    setState(initialState);
  }, [deviceFlow]);

  // Pick up OAuth token from sessionStorage after callback redirect.
  // Guard with a ref so React Strict Mode's double-mount does not
  // consume the token on the first run and then cancel verification
  // during cleanup before the second run finds an empty sessionStorage.
  useEffect(() => {
    if (oauthPickupRan.current) return;
    const raw = sessionStorage.getItem("morel_oauth_token");
    if (!raw) return;
    oauthPickupRan.current = true;
    sessionStorage.removeItem("morel_oauth_token");
    const parsed = JSON.parse(raw) as {
      accessToken: string;
      method: AuthMethod;
    };
    // Defer past commit so verify()'s setState calls don't cascade renders.
    queueMicrotask(() => {
      void verify(parsed.accessToken, parsed.method);
    });
  }, [verify]);

  return {
    ...state,
    token,
    connectWithPat,
    connectWithDeviceFlow,
    connectWithOAuth,
    deviceFlow: deviceFlow.state,
    retry,
    disconnect,
  };
}
