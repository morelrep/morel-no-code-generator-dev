const GATEWAY_URL = import.meta.env.VITE_MOREL_AUTH_GATEWAY_URL as
  | string
  | undefined;

if (!GATEWAY_URL) {
  throw new Error("VITE_MOREL_AUTH_GATEWAY_URL is not set");
}

type WorkerFetchOptions = {
  path: string;
  body: unknown;
};

/**
 * POST to the auth gateway. Throws on non-2xx responses with a structured error.
 */
export async function gatewayPost<T>(opts: WorkerFetchOptions): Promise<T> {
  const url = `${GATEWAY_URL}${opts.path}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts.body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Gateway ${opts.path} → ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}
