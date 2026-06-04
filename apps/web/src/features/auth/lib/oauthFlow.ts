import { generateCodeChallenge, generateCodeVerifier } from "../crypto/pkce";
import { randomBase64Url } from "../crypto/random";

const SESSION_KEY = "morel_oauth_pending";

export interface OAuthPendingState {
  codeVerifier: string | null;
  state: string;
  method: "oauth" | "github-app";
}

/**
 * Initiate the standard OAuth web flow (with PKCE).
 */
export async function initiateOAuthFlow(params: {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  method: "oauth" | "github-app";
}) {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = randomBase64Url(16);

  const pending: OAuthPendingState = {
    codeVerifier,
    state,
    method: params.method,
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(pending));

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", params.scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  window.location.href = url.toString();
}

/**
 * Redirect to the GitHub App installation page.
 * When "Request user authorization during installation" is enabled on the app,
 * GitHub redirects back to the callback URL with `code` and `state` after
 * installation — combining install + authorize in one step.
 * PKCE is not supported on this endpoint.
 */
export function initiateInstallationFlow(params: {
  appSlug: string;
  method: "github-app";
}) {
  const state = randomBase64Url(16);

  const pending: OAuthPendingState = {
    codeVerifier: null,
    state,
    method: params.method,
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(pending));

  const url = new URL(
    `https://github.com/apps/${params.appSlug}/installations/new`,
  );
  url.searchParams.set("state", state);

  window.location.href = url.toString();
}

export function consumeOAuthPendingState(
  returnedState: string,
): OAuthPendingState | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(SESSION_KEY);
  const pending = JSON.parse(raw) as OAuthPendingState;
  if (pending.state !== returnedState) return null; // CSRF check
  return pending;
}
