import { Octokit } from "@octokit/rest";
import { useCallback, useRef, useState } from "react";
import { authLogger } from "../lib/authLogger";
import {
  GitHubPatSchema,
  GitHubUserSchema,
} from "../schemas/githubAuth.schema";
import type {
  AuthMethod,
  AuthState,
  GitHubUser,
} from "../types/githubAuth.types";

const initialState: AuthState = {
  status: "disconnected",
  method: null,
  user: null,
  scopes: [],
  error: null,
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
      });
      setToken(token);

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

  const disconnect = useCallback(() => {
    authLogger.info("Disconnected");
    lastTokenRef.current = null;
    setToken(null);
    setState(initialState);
  }, []);

  return {
    ...state,
    token,
    connectWithPat,
    retry,
    disconnect,
  };
}
