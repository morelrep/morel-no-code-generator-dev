export type AuthMethod = "pat" | "device" | "oauth" | "github-app";

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
  /** Whether the GitHub App is installed on the user's account (null = not checked / not applicable). */
  appInstalled: boolean | null;
}

export type DeviceFlowStatus =
  | "idle"
  | "requesting" // POST /github/device/code in progress
  | "awaiting_user" // userCode shown, polling not yet started
  | "polling" // polling POST /github/device/token
  | "authorized" // token received, verification in progress
  | "expired" // device code expired before user authorized
  | "denied" // user explicitly denied on GitHub
  | "failed"; // unexpected error

export interface DeviceFlowState {
  status: DeviceFlowStatus;
  userCode: string | null; // e.g. "WDJB-MJHT"
  verificationUri: string | null; // https://github.com/login/device
  expiresAt: Date | null; // computed from expiresIn
  interval: number; // current polling interval in seconds
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
