import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type {
    WriteTestResult,
    WriteTestStep,
} from "../types/githubAuth.types";

interface WriteTestCardProps {
  result: WriteTestResult;
  onRun: () => void;
  onCleanup: () => void;
  onReset: () => void;
}

const stepStatusIcon: Record<WriteTestStep["status"], string> = {
  pending: "○",
  running: "◌",
  done: "✓",
  failed: "✗",
};

const stepStatusClass: Record<WriteTestStep["status"], string> = {
  pending: "text-muted-foreground",
  running: "text-amber-600",
  done: "text-emerald-600",
  failed: "text-destructive",
};

export function WriteTestCard({ result, onRun, onCleanup, onReset }: WriteTestCardProps) {
  const pendingDelete = result.status === "passed" && result.owner !== null;

  if (result.status === "idle") {
    return (
      <Card className="w-full max-w-lg">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Write Access Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Creates a temporary private repo, writes a file, verifies it, then
            deletes the repo. Tests the permissions MOREL needs for project
            setup.
          </p>
          <Separator />
          <Button variant="outline" size="sm" onClick={onRun}>
            Test Write Access
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Write Access Test</CardTitle>
        <Badge
          variant="outline"
          className={
            result.status === "passed"
              ? "border-emerald-600/50 bg-emerald-600/10 text-emerald-700"
              : result.status === "failed"
                ? "border-destructive/50 bg-destructive/10 text-destructive"
                : "border-amber-500/60 bg-amber-500/10 text-amber-700"
          }
        >
          {result.status === "running"
            ? "Running"
            : result.status === "passed"
              ? "Passed"
              : "Failed"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1.5 text-sm">
          {result.steps.map((step) => (
            <li key={step.label} className="flex items-start gap-2">
              <span className={`font-mono ${stepStatusClass[step.status]}`}>
                {stepStatusIcon[step.status]}
              </span>
              <span>
                {step.label}
                {step.detail && (
                  <span className="ml-1 text-muted-foreground">
                    — {step.detail}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>

        {result.status === "passed" && result.commitSha && (
          <div className="rounded-md border bg-muted/50 p-3 text-xs">
            <p>
              Commit:{" "}
              <code className="font-mono">
                {result.commitSha.slice(0, 7)}
              </code>
            </p>
            {result.repoUrl && (
              <p>
                Repo:{" "}
                {pendingDelete ? (
                  <a
                    href={result.repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {result.repoUrl}
                  </a>
                ) : (
                  <span className="text-muted-foreground">
                    {result.repoUrl} (deleted)
                  </span>
                )}
              </p>
            )}
          </div>
        )}

        {result.error && (
          <p className="text-sm text-red-600">{result.error}</p>
        )}

        {pendingDelete && (
          <Button
            variant="outline"
            size="sm"
            className="border-red-300 text-red-700 hover:bg-red-50"
            onClick={onCleanup}
          >
            Delete Test Repo
          </Button>
        )}

        {(result.status === "passed" || result.status === "failed") &&
          !pendingDelete && (
            <Button variant="ghost" size="sm" onClick={onReset}>
              Dismiss
            </Button>
          )}
      </CardContent>
    </Card>
  );
}
