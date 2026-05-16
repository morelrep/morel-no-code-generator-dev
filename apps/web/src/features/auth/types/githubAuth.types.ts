export type AuthMethod = "pat" | "oauth" | "github-app";

export type AuthStatus = "disconnected" | "connecting" | "connected" | "failed";

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
}

export interface AuthState {
  status: AuthStatus;
  method: AuthMethod | null;
  user: GitHubUser | null;
  scopes: string[];
  error: string | null;
}

export type WriteTestStatus = "idle" | "running" | "passed" | "failed";

export interface WriteTestStep {
  label: string;
  status: "pending" | "running" | "done" | "failed";
  detail?: string;
}

export interface WriteTestResult {
  status: WriteTestStatus;
  owner: string | null;
  repoName: string | null;
  repoUrl: string | null;
  commitSha: string | null;
  fileUrl: string | null;
  error: string | null;
  steps: WriteTestStep[];
}
