import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  if (method === "pat") {
    return "PAT";
  }

  if (method === "oauth") {
    return "OAuth App";
  }

  return "GitHub App";
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
          : state.method === "pat" && (
              <Badge variant="secondary">Fine-grained PAT</Badge>
            )}
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
    </Card>
  );
}
