import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { GITHUB_APP_SLUG } from "../hooks/useGitHubAuth";
import type {
  AuthState,
  DeviceFlowState,
} from "../types/githubAuth.types";

interface ConnectGitHubProps {
  status: AuthState["status"];
  deviceFlow: DeviceFlowState;
  onConnectPat: (token: string) => Promise<void> | void;
  onConnectDeviceFlow: (scopes: string[]) => Promise<void> | void;
  onCancelDeviceFlow: () => void;
  onConnectOAuth: (method: "oauth" | "github-app") => void;
}

export function ConnectGitHub({
  status,
  deviceFlow,
  onConnectPat,
  onConnectDeviceFlow,
  onCancelDeviceFlow,
  onConnectOAuth,
}: ConnectGitHubProps) {
  const [patValue, setPatValue] = useState("");
  const isLoading = status === "connecting";

  function handlePatSubmit(
    event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) {
    event.preventDefault();
    void onConnectPat(patValue);
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Connect to GitHub</CardTitle>
        <CardDescription>
          Choose an authentication method to connect your GitHub account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="pat">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="pat">PAT</TabsTrigger>
            <TabsTrigger value="device">Device Flow</TabsTrigger>
            <TabsTrigger value="oauth">OAuth App</TabsTrigger>
            <TabsTrigger value="github-app">GitHub App</TabsTrigger>
          </TabsList>

          <TabsContent value="pat" className="space-y-4 pt-4">
            <form onSubmit={handlePatSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pat-input">
                  Fine-grained Personal Access Token
                </Label>
                <Textarea
                  id="pat-input"
                  placeholder="github_pat_..."
                  value={patValue}
                  onChange={(event) => setPatValue(event.target.value)}
                  className="font-mono text-sm"
                  rows={3}
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  Fine-grained tokens start with <code>github_pat_</code>.
                </p>
              </div>
              <Separator />
              <Button type="submit" disabled={isLoading || !patValue.trim()}>
                {isLoading ? "Connecting" : "Connect"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="device" className="space-y-4 pt-4">
            {deviceFlow.status === "idle" || deviceFlow.status === "failed" ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Opens GitHub in a new tab. You will enter a short code to
                  authorize MOREL. No redirect — works in any browser.
                </p>
                {deviceFlow.error && (
                  <Alert variant="destructive">
                    <AlertDescription>{deviceFlow.error}</AlertDescription>
                  </Alert>
                )}
                <Button
                  onClick={() =>
                    onConnectDeviceFlow(["repo", "workflow"])
                  }
                >
                  Connect with Device Flow
                </Button>
              </div>
            ) : deviceFlow.status === "awaiting_user" ||
              deviceFlow.status === "polling" ||
              deviceFlow.status === "requesting" ? (
              <div className="space-y-4">
                {deviceFlow.status === "requesting" ? (
                  <p className="text-sm text-muted-foreground">
                    Requesting code…
                  </p>
                ) : (
                  <>
                    <p className="text-sm font-medium">
                      Enter this code at GitHub:
                    </p>
                    <code className="block rounded-lg bg-muted p-4 text-center font-mono text-3xl tracking-widest">
                      {deviceFlow.userCode}
                    </code>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() =>
                        window.open(
                          deviceFlow.verificationUri ?? "",
                          "_blank",
                        )
                      }
                    >
                      Open github.com/login/device ↗
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                      {deviceFlow.status === "polling"
                        ? `Checking every ${deviceFlow.interval}s…`
                        : "Waiting for you to open GitHub…"}
                    </p>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onCancelDeviceFlow}
                >
                  Cancel
                </Button>
              </div>
            ) : deviceFlow.status === "expired" ? (
              <div className="space-y-4">
                <Alert variant="destructive">
                  <AlertDescription>
                    Device code expired. Please try again.
                  </AlertDescription>
                </Alert>
                <Button
                  onClick={() =>
                    onConnectDeviceFlow(["repo", "workflow"])
                  }
                >
                  Restart
                </Button>
              </div>
            ) : deviceFlow.status === "denied" ? (
              <div className="space-y-4">
                <Alert variant="destructive">
                  <AlertDescription>
                    Authorization denied on GitHub.
                  </AlertDescription>
                </Alert>
                <Button
                  onClick={() =>
                    onConnectDeviceFlow(["repo", "workflow"])
                  }
                >
                  Restart
                </Button>
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="oauth" className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              Redirects to GitHub for authorization. You will be returned to
              this page with a token scoped to <code>repo</code> and{" "}
              <code>workflow</code>.
            </p>
            <Button onClick={() => onConnectOAuth("oauth")}>
              Connect with GitHub OAuth
            </Button>
          </TabsContent>

          <TabsContent value="github-app" className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              Connects via the MOREL GitHub App. Authorization is tied to the
              app's installation permissions rather than OAuth scopes.
            </p>
            <div className="rounded-md border bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Two steps required:</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>
                  <strong>Install</strong> the app on your GitHub account (
                  <a
                    href={`https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    install now ↗
                  </a>
                  )
                </li>
                <li>
                  <strong>Authorize</strong> via the button below
                </li>
              </ol>
            </div>
            <Button onClick={() => onConnectOAuth("github-app")}>
              Authorize GitHub App
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
