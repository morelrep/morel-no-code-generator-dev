import { Octokit } from "@octokit/rest";
import { useCallback, useEffect, useRef, useState } from "react";
import { authLogger } from "../lib/authLogger";
import type { WriteTestResult, WriteTestStep } from "../types/githubAuth.types";

const initialResult: WriteTestResult = {
  status: "idle",
  owner: null,
  repoName: null,
  repoUrl: null,
  commitSha: null,
  fileUrl: null,
  error: null,
  steps: [],
};

function makeSteps(): WriteTestStep[] {
  return [
    { label: "Create test repo", status: "pending" },
    { label: "Write README.md", status: "pending" },
    { label: "Verify file", status: "pending" },
    { label: "Delete test repo", status: "pending" },
  ];
}

function updateStep(
  steps: WriteTestStep[],
  index: number,
  update: Partial<WriteTestStep>,
): WriteTestStep[] {
  return steps.map((step, i) =>
    i === index ? { ...step, ...update } : step,
  );
}

function needsCleanup(result: WriteTestResult): boolean {
  return result.status === "passed" && result.owner !== null;
}

/**
 * Best-effort repo deletion using fetch with keepalive.
 * Used during beforeunload when we can't await an Octokit call.
 */
function fireAndForgetDelete(token: string, owner: string, repoName: string) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}`;
  fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
    },
    keepalive: true,
  }).catch(() => {
    // Best-effort — nothing we can do if it fails during page unload
  });
}

export function useWriteTest(token: string | null) {
  const [result, setResult] = useState<WriteTestResult>(initialResult);
  const tokenRef = useRef(token);
  const resultRef = useRef(result);

  // Sync refs in effects (not during render) for beforeunload access
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  // Clean up test repo on page refresh/close (best-effort)
  useEffect(() => {
    function handleBeforeUnload() {
      const currentToken = tokenRef.current;
      const currentResult = resultRef.current;
      if (
        currentToken &&
        currentResult.owner &&
        currentResult.repoName &&
        needsCleanup(currentResult)
      ) {
        fireAndForgetDelete(
          currentToken,
          currentResult.owner,
          currentResult.repoName,
        );
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const run = useCallback(async () => {
    if (!token) return;

    const octokit = new Octokit({
      auth: token,
      headers: { "X-GitHub-Api-Version": "2026-03-10" },
    });
    const timestamp = new Date();
    const repoName = `morel-test-${timestamp.toISOString().replace(/[:T]/g, "-").slice(0, 19)}`;
    let steps = makeSteps();

    setResult({ ...initialResult, status: "running", steps });
    authLogger.group("Write-pipeline test");

    try {
      // Step 1: Create repo
      steps = updateStep(steps, 0, { status: "running" });
      setResult((r) => ({ ...r, steps }));
      authLogger.info(`POST /user/repos (${repoName}) ...`);

      const { data: repo } =
        await octokit.rest.repos.createForAuthenticatedUser({
          name: repoName,
          description: `MOREL write-access test — ${timestamp.toISOString()} — safe to delete`,
          private: true,
          auto_init: false,
        });

      steps = updateStep(steps, 0, {
        status: "done",
        detail: repo.html_url,
      });
      setResult((r) => ({
        ...r,
        owner: repo.owner.login,
        repoName,
        repoUrl: repo.html_url,
        steps,
      }));
      authLogger.info(`Repo created: ${repo.html_url}`);

      // Step 2: Write README.md
      steps = updateStep(steps, 1, { status: "running" });
      setResult((r) => ({ ...r, steps }));
      authLogger.info(
        `PUT /repos/${repo.owner.login}/${repoName}/contents/README.md ...`,
      );

      const content = btoa(
        [
          "# MOREL Write Test",
          "",
          "This repo was created by the MOREL auth demo to verify write access.",
          "",
          `Created: ${timestamp.toISOString()}`,
          "",
          "Safe to delete.",
          "",
        ].join("\n"),
      );

      const { data: fileData } =
        await octokit.rest.repos.createOrUpdateFileContents({
          owner: repo.owner.login,
          repo: repoName,
          path: "README.md",
          message: `test: verify MOREL write access (${timestamp.toISOString()})`,
          content,
        });

      const commitSha = fileData.commit.sha ?? null;
      const fileUrl = fileData.content?.html_url ?? null;

      steps = updateStep(steps, 1, {
        status: "done",
        detail: `commit ${commitSha?.slice(0, 7)}`,
      });
      setResult((r) => ({ ...r, commitSha, fileUrl, steps }));
      authLogger.info(
        `File written: commit ${commitSha?.slice(0, 7)}, ${fileUrl}`,
      );

      // Step 3: Verify file exists
      steps = updateStep(steps, 2, { status: "running" });
      setResult((r) => ({ ...r, steps }));
      authLogger.debug(
        `GET /repos/${repo.owner.login}/${repoName}/contents/README.md ...`,
      );

      const { data: readBack } = await octokit.rest.repos.getContent({
        owner: repo.owner.login,
        repo: repoName,
        path: "README.md",
      });

      const verified = !Array.isArray(readBack) && readBack.type === "file";

      steps = updateStep(steps, 2, {
        status: verified ? "done" : "failed",
        detail: verified ? "File verified" : "Unexpected response",
      });
      setResult((r) => ({ ...r, steps }));
      authLogger.info(
        verified ? "File verified via GET" : "File verification failed",
      );

      // Step 4 (delete) is deferred — user can inspect the repo first
      setResult((r) => ({ ...r, status: "passed" }));
      authLogger.info(
        "Write test passed — repo kept for inspection. Delete manually or click 'Delete Test Repo'.",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      authLogger.error(`Write-pipeline test failed: ${message}`);

      const failedSteps = steps.map((s) =>
        s.status === "running"
          ? { ...s, status: "failed" as const, detail: message }
          : s,
      );

      setResult((r) => ({
        ...r,
        status: "failed",
        error: message,
        steps: failedSteps,
      }));
    } finally {
      authLogger.groupEnd();
    }
  }, [token]);

  const cleanup = useCallback(async () => {
    if (!token || !result.owner || !result.repoName) return;

    const octokit = new Octokit({
      auth: token,
      headers: { "X-GitHub-Api-Version": "2026-03-10" },
    });
    const owner = result.owner;
    const repoName = result.repoName;

    authLogger.group("Write-pipeline cleanup");

    setResult((r) => ({
      ...r,
      steps: updateStep(r.steps, 3, { status: "running" }),
    }));

    try {
      authLogger.info(`DELETE /repos/${owner}/${repoName} ...`);
      await octokit.rest.repos.delete({ owner, repo: repoName });

      setResult((r) => ({
        ...r,
        owner: null,
        steps: updateStep(r.steps, 3, {
          status: "done",
          detail: "Repo deleted",
        }),
      }));
      authLogger.info("Test repo deleted");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      authLogger.error(`Cleanup failed: ${message}`);

      setResult((r) => ({
        ...r,
        steps: updateStep(r.steps, 3, {
          status: "failed",
          detail: message,
        }),
      }));
    } finally {
      authLogger.groupEnd();
    }
  }, [token, result]);

  const reset = useCallback(() => {
    setResult(initialResult);
  }, []);

  return {
    result,
    run,
    cleanup,
    reset,
    needsCleanup: needsCleanup(result),
  };
}
