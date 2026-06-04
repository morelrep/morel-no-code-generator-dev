import { AuthDemo } from "@/features/auth";

export function IndexPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col items-center gap-6 px-4 py-10">
      <AuthDemo
        title="Morel GitHub Auth Demo"
        description="Connect a fine-grained GitHub PAT and verify it against the GitHub API."
      />
    </main>
  );
}
