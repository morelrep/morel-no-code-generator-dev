import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { gatewayPost } from "@/features/auth/lib/workerClient";
import { consumeOAuthPendingState } from "@/features/auth/lib/oauthFlow";
import { authLogger } from "@/features/auth/lib/authLogger";

type CallbackStatus = "processing" | "error";

export function AuthCallbackPage() {
  const [status, setStatus] = useState<CallbackStatus>("processing");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    async function handleCallback() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const returnedState = params.get("state");
      const errorParam = params.get("error");

      if (errorParam) {
        authLogger.error(`OAuth callback error: ${errorParam}`);
        setError(
          errorParam === "access_denied"
            ? "Authorization denied on GitHub"
            : `GitHub error: ${errorParam}`,
        );
        setStatus("error");
        return;
      }

      if (!code || !returnedState) {
        setError("Missing code or state in callback URL");
        setStatus("error");
        return;
      }

      const pending = consumeOAuthPendingState(returnedState);
      if (!pending) {
        authLogger.error(
          "OAuth callback: state mismatch or missing pending state",
        );
        setError("Security check failed — please retry the authorization");
        setStatus("error");
        return;
      }

      authLogger.group(`OAuth callback (${pending.method})`);
      try {
        authLogger.debug("POST /github/oauth/exchange ...");
        const result = await gatewayPost<{
          accessToken: string;
          tokenType: string;
          scope: string;
        }>({
          path: "/github/oauth/exchange",
          body: {
            code,
            ...(pending.codeVerifier
              ? { codeVerifier: pending.codeVerifier }
              : {}),
          },
        });
        authLogger.info("Exchange succeeded (token redacted)");

        // Store token in sessionStorage under a known key so the destination
        // page can pick it up and call verify(). Never store in localStorage.
        sessionStorage.setItem(
          "morel_oauth_token",
          JSON.stringify({
            accessToken: result.accessToken,
            method: pending.method,
          }),
        );

        await navigate({ to: "/" });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error";
        authLogger.error(`Exchange failed: ${message}`);
        setError(message);
        setStatus("error");
      } finally {
        authLogger.groupEnd();
      }
    }

    void handleCallback();
  }, [navigate]);

  if (status === "error") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-destructive">{error}</p>
        <a href="/" className="text-sm underline">
          Go back
        </a>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Processing authentication…</p>
    </main>
  );
}
