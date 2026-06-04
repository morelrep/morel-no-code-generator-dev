import { useCallback } from "react";
import { useGitHubAuth } from "../hooks/useGitHubAuth";
import { useWriteTest } from "../hooks/useWriteTest";
import { AuthStatus } from "./AuthStatus";
import { ConnectGitHub } from "./ConnectGitHub";
import { WriteTestCard } from "./WriteTestCard";

interface AuthDemoProps {
  title: string;
  description: string;
}

export function AuthDemo({ title, description }: AuthDemoProps) {
  const auth = useGitHubAuth();
  const writeTest = useWriteTest(auth.token);

  const handleDisconnect = useCallback(async () => {
    if (writeTest.needsCleanup) {
      await writeTest.cleanup();
    }
    writeTest.reset();
    auth.disconnect();
  }, [auth, writeTest]);

  return (
    <>
      <div className="w-full max-w-lg space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <AuthStatus
        state={auth}
        onRetry={auth.retry}
        onDisconnect={handleDisconnect}
      />

      {auth.status === "connected" && (
        <WriteTestCard
          result={writeTest.result}
          onRun={writeTest.run}
          onCleanup={writeTest.cleanup}
          onReset={writeTest.reset}
        />
      )}

      {auth.status !== "connected" && (
        <ConnectGitHub
          status={auth.status}
          deviceFlow={auth.deviceFlow}
          onConnectPat={auth.connectWithPat}
          onConnectDeviceFlow={auth.connectWithDeviceFlow}
          onCancelDeviceFlow={auth.disconnect}
          onConnectOAuth={auth.connectWithOAuth}
        />
      )}
    </>
  );
}
