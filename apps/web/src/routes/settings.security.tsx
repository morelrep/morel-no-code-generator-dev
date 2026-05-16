import { AuthDemo } from "@/features/auth";

export function SecuritySettingsPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col items-center gap-6 px-4 py-10">
      <AuthDemo
        title="Security Settings"
        description="Connect GitHub credentials for the local auth demo."
      />
    </main>
  );
}
