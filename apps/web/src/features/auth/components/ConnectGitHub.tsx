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
import type { AuthState } from "../types/githubAuth.types";

interface ConnectGitHubProps {
  status: AuthState["status"];
  onConnectPat: (token: string) => Promise<void> | void;
}

export function ConnectGitHub({ status, onConnectPat }: ConnectGitHubProps) {
  const [patValue, setPatValue] = useState("");
  const isLoading = status === "connecting";

  function handlePatSubmit(event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>) {
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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pat">PAT</TabsTrigger>
            <TabsTrigger value="oauth" disabled>
              OAuth App
            </TabsTrigger>
            <TabsTrigger value="github-app" disabled>
              GitHub App
            </TabsTrigger>
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

          <TabsContent value="oauth" className="pt-4">
            <p className="text-sm text-muted-foreground">
              OAuth App flow will be available in a later phase.
            </p>
          </TabsContent>

          <TabsContent value="github-app" className="pt-4">
            <p className="text-sm text-muted-foreground">
              GitHub App flow will be available in a later phase.
            </p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
