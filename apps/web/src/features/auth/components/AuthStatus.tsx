import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GITHUB_APP_SLUG } from "../hooks/useGitHubAuth";
import type {
  AuthState,
  AuthStatus as AuthStatusValue,
} from "../types/githubAuth.types";

interface AuthStatusProps {
  state: AuthState;
  onRetry?: () => void;
  onDisconnect?: () => void;
}

const statusBadgeClassName: Record<AuthStatusValue, string> = {
  disconnected: "border-muted-foreground/30 text-muted-foreground",
  connecting: "border-amber-500/60 bg-amber-500/10 text-amber-700",
  connected: "border-emerald-600/50 bg-emerald-600/10 text-emerald-700",
  failed: "border-destructive/50 bg-destructive/10 text-destructive",
};

function formatMethod(method: AuthState["method"]): string | null {
  if (!method) {
    return null;
  }

  const labels: Record<string, string> = {
    pat: "PAT",
    device: "DEVICE",
    oauth: "OAUTH",
    "github-app": "GITHUB-APP",
  };

  return labels[method] ?? method.toUpperCase();
}

export function AuthStatus({ state, onRetry, onDisconnect }: AuthStatusProps) {
  if (state.status === "disconnected") {
    return null;
  }

  if (state.status === "failed") {
    return (
      <Alert variant="destructive" className="w-full max-w-lg">
        <AlertDescription className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>{state.error ?? "Authentication failed"}</span>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="flex flex-row items-center gap-4 pb-2">
        {state.user?.avatar_url && (
          <img
            src={state.user.avatar_url}
            alt={`${state.user.login}'s avatar`}
            className="size-12 rounded-full border object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate text-base">
            {state.user?.login ?? "Connecting"}
          </CardTitle>
          {state.user?.name && (
            <p className="truncate text-sm text-muted-foreground">
              {state.user.name}
            </p>
          )}
        </div>
        <Badge variant="outline" className={statusBadgeClassName[state.status]}>
          {state.status === "connecting" ? "Connecting" : "Connected"}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        {formatMethod(state.method) && (
          <Badge variant="outline">{formatMethod(state.method)}</Badge>
        )}
        {state.scopes.length > 0
          ? state.scopes.map((scope) => (
              <Badge key={scope} variant="secondary">
                {scope}
              </Badge>
            ))
          : state.method === "pat" || state.method === "device" ? (
              <Badge variant="secondary">Fine-grained token</Badge>
            ) : state.method === "github-app" ? (
              <Badge variant="secondary">App permissions</Badge>
            ) : null}
        {onDisconnect && state.status === "connected" && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={onDisconnect}
          >
            Disconnect
          </Button>
        )}
      </CardContent>

      {state.method === "github-app" && state.appInstalled === false && (
        <Alert className="border-amber-500/50 bg-amber-500/5">
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm">
              The MOREL GitHub App is <strong>authorized</strong> but not yet{" "}
              <strong>installed</strong> on your account. Install it to grant
              repository permissions.
            </span>
            <Button variant="outline" size="sm" asChild>
              <a
                href={`https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Install App ↗
              </a>
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </Card>
  );
}
