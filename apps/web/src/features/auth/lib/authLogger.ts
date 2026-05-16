const PREFIX = "[auth]";

interface AuthLogger {
  group(label: string): void;
  groupEnd(): void;
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

function noop() {}

function createLogger(): AuthLogger {
  if (!import.meta.env.DEV) {
    return {
      group: noop,
      groupEnd: noop,
      info: noop,
      debug: noop,
      error: noop,
    };
  }

  return {
    group(label: string) {
      console.group(`${PREFIX} ${label}`);
    },
    groupEnd() {
      console.groupEnd();
    },
    info(...args: unknown[]) {
      console.info(PREFIX, ...args);
    },
    debug(...args: unknown[]) {
      console.debug(PREFIX, ...args);
    },
    error(...args: unknown[]) {
      console.error(PREFIX, ...args);
    },
  };
}

export const authLogger = createLogger();
