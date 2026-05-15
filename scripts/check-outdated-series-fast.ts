#!/usr/bin/env tsx
/// <reference lib="es2024.promise" />
/**
 * check-outdated-series-fast.ts
 *
 * Reports outdated dependencies alongside the latest version available within
 * the same MAJOR version series.  Useful for deciding which packages can be
 * safely upgraded without a breaking-change migration.
 *
 * Supports pnpm monorepos: runs `pnpm outdated -r --format json` to get
 * per-workspace results, then prints a separate table for each workspace.
 * Registry lookups are deduped across workspaces (same package fetched once).
 *
 * Respects the `minimumReleaseAge` cooldown from pnpm-workspace.yaml:
 * versions published less than N minutes ago are excluded from the "latest
 * in series" result, matching what pnpm would actually allow to install.
 * Packages listed in `minimumReleaseAgeExclude` bypass this filter.
 *
 * This is the fast variant: it uses direct fetch() calls to the effective
 * registry (resolved via `pnpm config get registry`) instead of spawning
 * `pnpm view` sub-processes for each package lookup.  This respects any
 * configured registry proxy (e.g. Aikido safe chain) while staying fast.
 *
 * Usage:
 *   pnpm check:outdated
 *   pnpm check:outdated -- --cooldown 72      # override: 72-hour cooldown
 *   pnpm check:outdated -- --no-cooldown      # disable cooldown entirely
 *   pnpm tsx scripts/check-outdated-series-fast.ts
 *
 * Requirements: pnpm (in PATH)
 */

import { execFile } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const MAX_JOBS = 30
const REGISTRY_TIMEOUT_MS = 15_000
const PNPM_OUTDATED_TIMEOUT_MS = 120_000
const MAX_RETRIES = 1
const RETRY_DELAY_MS = 2_000
const DEFAULT_REGISTRY = 'https://registry.npmjs.org'
const DEFAULT_COOLDOWN_HOURS = 48

// ── CLI flags ─────────────────────────────────────────────────────────────────
// --cooldown <hours>   Override cooldown period (default: from pnpm-workspace.yaml, else 48h)
// --no-cooldown        Disable cooldown filtering entirely

interface CliFlags {
  cooldownOverrideMs: number | null // null = use pnpm-workspace.yaml value
  noCooldown: boolean
}

function parseCliFlags(): CliFlags {
  const args = process.argv.slice(2)
  let cooldownOverrideMs: number | null = null
  let noCooldown = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--no-cooldown') {
      noCooldown = true
    } else if (args[i] === '--cooldown' && i + 1 < args.length) {
      const hours = parseFloat(args[i + 1]!)
      if (Number.isFinite(hours) && hours >= 0) {
        cooldownOverrideMs = hours * 60 * 60 * 1000
      } else {
        console.error(`Warning: invalid --cooldown value "${args[i + 1]}", using default.`)
      }
      i++ // skip next arg (the value)
    }
  }

  return { cooldownOverrideMs, noCooldown }
}

// ── Cooldown policy ──────────────────────────────────────────────────────────
// Reads minimumReleaseAge (minutes) and exclusion patterns from pnpm-workspace.yaml
// so the script only recommends versions that pnpm would actually allow to install.

interface CooldownConfig {
  minimumReleaseAgeMs: number
  excludePatterns: string[]
}

function readCooldownConfig(): CooldownConfig {
  const wsFile = resolve(import.meta.dirname ?? process.cwd(), '..', 'pnpm-workspace.yaml')
  let content: string
  try {
    content = readFileSync(wsFile, 'utf-8')
  } catch {
    // If the file can't be read, no cooldown filtering
    return { minimumReleaseAgeMs: 0, excludePatterns: [] }
  }

  // Parse minimumReleaseAge (in minutes)
  const ageMatch = content.match(/^minimumReleaseAge:\s*(\d+)/m)
  const ageMinutes = ageMatch ? parseInt(ageMatch[1]!, 10) : 0
  const minimumReleaseAgeMs = ageMinutes * 60 * 1000

  // Parse minimumReleaseAgeExclude list
  const excludePatterns: string[] = []
  const excludeSection = content.match(/^minimumReleaseAgeExclude:\s*\n((?:\s*-\s*.+\n?)*)/m)
  if (excludeSection?.[1]) {
    for (const line of excludeSection[1].split('\n')) {
      const m = line.match(/^\s*-\s*["']?([^"'\n]+?)["']?\s*$/)
      if (m?.[1]) excludePatterns.push(m[1])
    }
  }

  return { minimumReleaseAgeMs, excludePatterns }
}

/**
 * Check if a package name matches any of the cooldown exclusion patterns.
 * Supports trailing wildcards (e.g. "@payloadcms/*" matches "@payloadcms/ui").
 */
function isCooldownExcluded(pkgName: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern.endsWith('*')) {
      return pkgName.startsWith(pattern.slice(0, -1))
    }
    return pkgName === pattern
  })
}

// ── Types ────────────────────────────────────────────────────────────────────
// Data shapes for the pipeline. PnpmOutdatedEntry / FullPackument model
// external data; isFullPackument guards against unexpected registry responses.

interface Package {
  name: string
  current: string
  latest: string
  depType: string
}

interface Result extends Package {
  series: string
}

type AsyncTask<T> = () => Promise<T>
type Limiter = <T>(fn: AsyncTask<T>) => Promise<T>

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// Shape of one entry in `pnpm outdated --json` object format (pnpm 9+)
interface PnpmOutdatedEntry {
  current: string
  latest: string
  dependencyType: string
}

function isPnpmOutdatedEntry(value: unknown): value is PnpmOutdatedEntry {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>)['current'] === 'string'
  )
}

// Abbreviated packument from the npm registry
interface AbbreviatedPackument {
  versions?: Record<string, unknown>
}

function isAbbreviatedPackument(value: unknown): value is AbbreviatedPackument {
  return (
    value !== null &&
    typeof value === 'object' &&
    (!('versions' in value) || typeof (value as Record<string, unknown>)['versions'] === 'object')
  )
}

// Full packument (used when cooldown is active — includes time field)
interface FullPackument {
  versions?: Record<string, unknown>
  time?: Record<string, string>
}

function isFullPackument(value: unknown): value is FullPackument {
  return (
    value !== null &&
    typeof value === 'object' &&
    (!('versions' in value) || typeof (value as Record<string, unknown>)['versions'] === 'object')
  )
}

interface PackageVersionInfo {
  versions: string[]
  publishTimes: Record<string, string>
}

// ── Concurrency limiter ───────────────────────────────────────────────────────

/**
 * FIFO promise queue — at most maxConcurrent tasks run simultaneously.
// Remaining tasks are held in the queue and started as slots free up.
 * 
 * Create a limiter with a maximum number of simultaneous jobs.
 *
 * Remember:
 * - how many jobs are currently active
 * - which jobs are waiting
 *
 * When someone gives me a new async job:
 * - if there is room, start it now
 * - if there is no room, save it for later
 *
 * When a job finishes:
 * - mark one active slot as free
 * - start the next waiting job, if one exists
 *
 * Return a promise to the caller immediately, so the caller can await the
 * result even if the job has not started yet.
 */
function createLimiter(maxConcurrent: number): Limiter {
  let active = 0
  const queue: AsyncTask<void>[] = [] // Continuation Queue

  // Limiter function returned
  // Give me a task. I will give you back a Promise for that task’s future result.
  return function limit<T>(fn: AsyncTask<T>): Promise<T> {
    // Unnested Promise
    const { promise, resolve, reject } = Promise.withResolvers<T>()

    // Task Runner Closure Function
    const run = async () => {
      active++ // accounts job that will begin
      try {
        resolve(await fn()) // begins the job and wait here until it finishes
      } catch (err) {
        reject(err) // if this job fails
      } finally {
        active-- // accounts the job that is over
        queue.shift()?.() // runs the run function of the next waiting job, if any
      }
    }

    // Decision Logic
    if (active < maxConcurrent) {
      run() // starts the job immediately
    } else {
      queue.push(run) // enqueue the job to be run later
    }

    return promise
  }
}

// ── pnpm wrapper (only used for `pnpm outdated`) ─────────────────────────────
// Never throws — errors are captured and returned as a structured { stdout, stderr, code }.

interface PnpmResult {
  stdout: string
  stderr: string
  code: number
}

async function runPnpm(args: string[], timeoutMs = 0): Promise<PnpmResult> {
  try {
    const { stdout, stderr } = await execFileAsync('pnpm', args, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
    })
    return { stdout: stdout.trim(), stderr: stderr.trim(), code: 0 }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number }
    return {
      stdout: (e.stdout ?? '').trim(),
      stderr: (e.stderr ?? '').trim(),
      code: e.code ?? 1,
    }
  }
}

// ── Registry URL ──────────────────────────────────────────────────────────────
// Reads the effective registry once so custom proxy and private registry settings are honoured.

/** Read the effective registry once (respects ~/.npmrc, env vars, Aikido proxy, etc.) */
async function getRegistryUrl(): Promise<string> {
  const { stdout, code } = await runPnpm(['config', 'get', 'registry'])
  if (code === 0 && stdout) {
    return stdout.replace(/\/$/, '')
  }
  return DEFAULT_REGISTRY
}

// ── Registry fetch ────────────────────────────────────────────────────────────
// Requests the packument for a single package. When cooldown filtering is active,
// fetches the full packument (includes `time` field with publish dates per version).
// Otherwise uses the abbreviated format (smaller payload, no time data).
// Retries once on rate-limit (429) or server errors (5xx) with linear backoff.

async function fetchPackageInfo(
  pkgName: string,
  registryUrl: string,
  needTimes: boolean,
): Promise<PackageVersionInfo> {
  const url = `${registryUrl}/${pkgName}`

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // noRetry = true for HTTP/application errors; false for transient network errors.
    // Only transient errors (DNS, connection reset, timeout) are worth retrying.
    let noRetry = false
    try {
      const headers: Record<string, string> = needTimes
        ? { Accept: 'application/json' }
        : { Accept: 'application/vnd.npm.install-v1+json' }

      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
      })

      // Retry on 429 / 5xx if we have retries left
      if (!res.ok) {
        if (attempt < MAX_RETRIES && (res.status === 429 || res.status >= 500)) {
          await sleep(RETRY_DELAY_MS * (attempt + 1))
          continue
        }
        noRetry = true
        throw new Error(`${res.status} ${res.statusText}`)
      }

      const data: unknown = await res.json()

      if (needTimes) {
        if (!isFullPackument(data)) {
          noRetry = true
          throw new Error('Unexpected registry response shape')
        }
        return {
          versions: Object.keys(data.versions ?? {}),
          publishTimes: data.time ?? {},
        }
      } else {
        if (!isAbbreviatedPackument(data)) {
          noRetry = true
          throw new Error('Unexpected registry response shape')
        }
        return {
          versions: Object.keys(data.versions ?? {}),
          publishTimes: {},
        }
      }
    } catch (err) {
      if (!noRetry && attempt < MAX_RETRIES) {
        // Retry on transient network errors (DNS, connection reset, etc.)
        await sleep(RETRY_DELAY_MS * (attempt + 1))
        continue
      }
      throw err
    }
  }

  // Unreachable, but satisfies TypeScript
  throw new Error('fetchPackageInfo: exhausted retries')
}

// ── Parsing ───────────────────────────────────────────────────────────────────
// Normalises pnpm output into workspace-grouped Package maps.
// `pnpm outdated -r --format json` (pnpm 9+) returns a nested object:
//   { "/path/to/workspace": { "pkg-name": { current, latest, dependencyType } } }
// Non-recursive (single project) returns a flat object:
//   { "pkg-name": { current, latest, dependencyType } }

/** A workspace label → its outdated packages */
interface WorkspaceOutdated {
  label: string
  packages: Package[]
}

// ── Workspace discovery ───────────────────────────────────────────────────────
// Cross-references outdated packages with each workspace's package.json to assign
// them to the correct workspace.  Needed because pnpm 11 returns a flat object
// from `pnpm outdated -r --format json` instead of grouping by workspace path.

const DEP_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const

/** Read all dependency names declared in a package.json */
function getDeclaredDeps(pkgJsonPath: string): Set<string> {
  try {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
    const deps = new Set<string>()
    for (const field of DEP_FIELDS) {
      if (pkg[field] && typeof pkg[field] === 'object') {
        for (const name of Object.keys(pkg[field] as Record<string, unknown>)) deps.add(name)
      }
    }
    return deps
  } catch {
    return new Set()
  }
}

/** Group a flat list of outdated packages by workspace, using each workspace's package.json */
function groupByWorkspace(pkgs: Package[]): WorkspaceOutdated[] {
  const cwd = process.cwd()

  // Read workspace patterns from pnpm-workspace.yaml
  const wsFile = resolve(cwd, 'pnpm-workspace.yaml')
  const patterns: string[] = []
  try {
    const content = readFileSync(wsFile, 'utf-8')
    const patternMatch = content.match(/^packages:\s*\n((?:\s*-\s*.+\n?)*)/m)
    if (patternMatch?.[1]) {
      for (const line of patternMatch[1].split('\n')) {
        const m = line.match(/^\s*-\s*["']?([^"'\n]+?)["']?\s*$/)
        if (m?.[1]) patterns.push(m[1])
      }
    }
  } catch {
    // no workspace file — everything goes to root
  }

  // Build workspace → declared-deps map
  interface WorkspaceInfo {
    label: string
    deps: Set<string>
  }
  const workspaceInfos: WorkspaceInfo[] = []

  // Root workspace
  const rootDeps = getDeclaredDeps(resolve(cwd, 'package.json'))
  if (rootDeps.size > 0) workspaceInfos.push({ label: '(root)', deps: rootDeps })

  // Child workspaces — resolve each pattern (supports simple `dir/*` globs)
  for (const pattern of patterns) {
    const dir = pattern.replace(/\/\*$/, '')
    const fullDir = resolve(cwd, dir)
    try {
      const entries = readdirSync(fullDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const wsDir = resolve(fullDir, entry.name)
        const deps = getDeclaredDeps(resolve(wsDir, 'package.json'))
        if (deps.size > 0) {
          workspaceInfos.push({ label: `${dir}/${entry.name}`, deps })
        }
      }
    } catch {
      // skip inaccessible directories
    }
  }

  // Assign each outdated package to its workspace(s)
  const wsMap = new Map<string, Package[]>()
  const unmatched: Package[] = []

  for (const pkg of pkgs) {
    let matched = false
    for (const ws of workspaceInfos) {
      if (ws.deps.has(pkg.name)) {
        if (!wsMap.has(ws.label)) wsMap.set(ws.label, [])
        wsMap.get(ws.label)!.push(pkg)
        matched = true
      }
    }
    if (!matched) unmatched.push(pkg)
  }

  // Build result preserving workspace discovery order
  const result: WorkspaceOutdated[] = []
  for (const ws of workspaceInfos) {
    const wsPkgs = wsMap.get(ws.label)
    if (wsPkgs && wsPkgs.length > 0) {
      result.push({
        label: ws.label,
        packages: wsPkgs.sort((a, b) => a.name.localeCompare(b.name)),
      })
    }
  }
  if (unmatched.length > 0) {
    result.push({
      label: '(unmatched)',
      packages: unmatched.sort((a, b) => a.name.localeCompare(b.name)),
    })
  }

  return result.length > 0
    ? result
    : [{ label: '.', packages: pkgs.sort((a, b) => a.name.localeCompare(b.name)) }]
}

function parseOutdatedRecursive(json: string): WorkspaceOutdated[] {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('Could not parse pnpm outdated --json output.')
  }

  if (Array.isArray(data)) {
    // pnpm <9 array format (single workspace, no path keys)
    const pkgs: Package[] = []
    for (const p of data as Array<Record<string, string>>) {
      const name = p['packageName'] ?? p['name'] ?? ''
      if (name && p['current']) {
        pkgs.push({
          name,
          current: p['current'],
          latest: p['latest'] ?? '',
          depType: p['dependencyType'] ?? '',
        })
      }
    }
    return groupByWorkspace(pkgs)
  }

  if (data === null || typeof data !== 'object') {
    return []
  }

  const entries = Object.entries(data as Record<string, unknown>)
  if (entries.length === 0) return []

  // Detect if this is a flat object (all values are PnpmOutdatedEntry) or nested (values are objects of entries)
  const firstValue = entries[0]![1]
  const isFlat = isPnpmOutdatedEntry(firstValue)

  if (isFlat) {
    // pnpm 11+ flat format — all packages in one object, not grouped by workspace.
    // Cross-reference with workspace package.json files to group correctly.
    const pkgs: Package[] = []
    for (const [name, info] of entries) {
      if (isPnpmOutdatedEntry(info)) {
        pkgs.push({
          name,
          current: info.current,
          latest: info.latest ?? '',
          depType: info.dependencyType ?? '',
        })
      }
    }
    return groupByWorkspace(pkgs)
  }

  // Nested object — keys are workspace paths, values are { pkgName: entry }
  const workspaces: WorkspaceOutdated[] = []
  for (const [wsPath, wsData] of entries) {
    if (wsData === null || typeof wsData !== 'object') continue
    const pkgs: Package[] = []
    for (const [name, info] of Object.entries(wsData as Record<string, unknown>)) {
      if (isPnpmOutdatedEntry(info)) {
        pkgs.push({
          name,
          current: info.current,
          latest: info.latest ?? '',
          depType: info.dependencyType ?? '',
        })
      }
    }
    if (pkgs.length > 0) {
      // Derive a friendly label from the workspace path
      const label = deriveWorkspaceLabel(wsPath)
      workspaces.push({ label, packages: pkgs.sort((a, b) => a.name.localeCompare(b.name)) })
    }
  }

  return workspaces
}

/** Derive a short label from a workspace absolute path (e.g. "/foo/bar/packages/cli-lab" → "packages/cli-lab") */
function deriveWorkspaceLabel(wsPath: string): string {
  const cwd = process.cwd()
  if (wsPath === cwd || wsPath === '.') return '(root)'
  // Try to make it relative to cwd
  if (wsPath.startsWith(cwd + '/')) {
    return wsPath.slice(cwd.length + 1)
  }
  // Fallback: last two path segments
  const segments = wsPath.split('/')
  return segments.slice(-2).join('/')
}

// ── Version lookup ────────────────────────────────────────────────────────────
// Determines the highest stable release within the same major (or semi-major) series.
// Semi-major packages (payload / @payloadcms/*) treat floor(MINOR/10) as the series boundary.

// Stable = strictly X.Y.Z — any SemVer pre-release hyphen tag makes it unstable.
function isStable(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version)
}

// Packages where floor(MINOR / 10) defines the upgrade series.
// e.g. payload@3.75.0 and @3.79.0 are both series "3.7"; 3.80.x is series "3.8".
// Edit this list to add/remove packages that follow a similar versioning convention.
function isSemiMajorPackage(pkgName: string): boolean {
  return pkgName === 'payload' || pkgName.startsWith('@payloadcms/')
}

/** Numeric semver comparison for stable X.Y.Z strings. */
function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

function latestInSeries(
  pkgName: string,
  versions: string[],
  current: string,
  publishTimes: Record<string, string>,
  cooldownCutoff: number,
): string {
  const parts = current.split('.')
  const major = parts[0]!
  const currentMinorGroup = Math.floor(parseInt(parts[1] ?? '0', 10) / 10)
  const semiMajor = isSemiMajorPackage(pkgName)

  const stable = versions
    .filter((v) => {
      if (!isStable(v)) return false
      const vParts = v.split('.')
      if (vParts[0] !== major) return false
      if (semiMajor) {
        // For semi-major packages: only include versions in the same minor-group (tens digit).
        if (Math.floor(parseInt(vParts[1] ?? '0', 10) / 10) !== currentMinorGroup) return false
      }
      // Apply cooldown: exclude versions published less than minimumReleaseAge ago
      if (cooldownCutoff > 0 && publishTimes[v]) {
        const publishedAt = new Date(publishTimes[v]).getTime()
        if (!Number.isNaN(publishedAt) && publishedAt > cooldownCutoff) return false
      }
      return true
    })
    .sort(compareSemver)

  return stable.at(-1) ?? 'N/A'
}

// ── Table renderer ────────────────────────────────────────────────────────────
// Renders a Unicode box-drawing table to stdout and prints a three-line upgrade summary.

function printTable(results: Result[], workspaceLabel: string, cooldownHours: number): void {
  const headers = ['Package', 'Current', 'Latest', 'Latest (same series) §', 'Type']

  const displayRows = results.map(({ name, current, latest, series, depType }) => {
    const tag =
      series === current ? `${current}  (current)` : series === 'N/A' ? 'N/A' : `${series}  ⬆`
    return [name, current, latest, tag, depType]
  })

  const widths = headers.map((h, i) => Math.max(h.length, ...displayRows.map((r) => r[i]!.length)))

  const hline = (l: string, sep: string, r: string) =>
    l + widths.map((w) => '─'.repeat(w + 2)).join(sep) + r

  const row = (cols: string[]) => '│ ' + cols.map((c, i) => c.padEnd(widths[i]!)).join(' │ ') + ' │'

  console.log()
  console.log(`  ┈┈ ${workspaceLabel} ┈┈`)
  console.log(hline('┌', '┬', '┐'))
  console.log(row(headers))
  console.log(hline('├', '┼', '┤'))
  for (const r of displayRows) console.log(row(r))
  console.log(hline('└', '┴', '┘'))

  const upgradable = results.filter((r) => r.series !== r.current && r.series !== 'N/A')
  const atLatest = results.filter((r) => r.series === r.current)
  const majorBumps = results.filter((r) => r.series === r.current && r.current !== r.latest)

  console.log()
  console.log(`  ⬆  ${upgradable.length} package(s) can be upgraded within the same series`)
  console.log(`  ✓  ${atLatest.length} package(s) already at latest in their series`)
  console.log(
    `  ⚠  ${majorBumps.length} of those are at latest in-series but a newer version exists upstream`,
  )
  console.log()
  console.log(
    `  §  payload / @payloadcms/* series = MAJOR.floor(MINOR/10)  (e.g. 3.75 → series "3.7"; 3.80 → series "3.8")`,
  )
  if (cooldownHours > 0) {
    console.log(
      `  §  Versions published < ${cooldownHours}h ago excluded (minimumReleaseAge from pnpm-workspace.yaml)`,
    )
  }
  console.log()
}

// ── Main ──────────────────────────────────────────────────────────────────────
// Orchestrates: (1) read cooldown config, (2) run pnpm outdated -r,
// (3) parse per-workspace output, (4) deduped parallel registry lookups,
// (5) render a table per workspace.

async function main(): Promise<void> {
  const t0 = performance.now()

  // Step 0 – Read cooldown policy (CLI flags override pnpm-workspace.yaml)
  const flags = parseCliFlags()
  const cooldown = readCooldownConfig()

  let effectiveCooldownMs: number
  if (flags.noCooldown) {
    effectiveCooldownMs = 0
  } else if (flags.cooldownOverrideMs !== null) {
    effectiveCooldownMs = flags.cooldownOverrideMs
  } else if (cooldown.minimumReleaseAgeMs > 0) {
    effectiveCooldownMs = cooldown.minimumReleaseAgeMs
  } else {
    effectiveCooldownMs = DEFAULT_COOLDOWN_HOURS * 60 * 60 * 1000
  }

  const cooldownCutoff = effectiveCooldownMs > 0 ? Date.now() - effectiveCooldownMs : 0
  const cooldownHours = effectiveCooldownMs / (60 * 60 * 1000)

  if (cooldownCutoff > 0) {
    console.log(
      `Cooldown policy: excluding versions published < ${cooldownHours}h ago` +
        (cooldown.excludePatterns.length > 0
          ? ` (bypassed for: ${cooldown.excludePatterns.join(', ')})`
          : ''),
    )
  }

  // Step 1 – Fetch outdated packages (recursive for monorepo support)
  process.stdout.write('Fetching outdated packages (all workspaces) … ')

  const {
    stdout: outdatedRaw,
    stderr: outdatedErr,
    code: outdatedCode,
  } = await runPnpm(['outdated', '-r', '--format', 'json'], PNPM_OUTDATED_TIMEOUT_MS)

  if (!outdatedRaw) {
    // pnpm outdated exits 0 when nothing is outdated (empty stdout).
    // Any other non-zero exit with no JSON on stdout is a real error.
    if (outdatedCode !== 0 && outdatedErr) {
      console.error(`\nError: pnpm outdated failed:\n${outdatedErr}`)
      process.exitCode = 1
      return
    }
    console.log('all up to date ✓')
    return
  }

  // Step 2 – Parse into per-workspace groups
  const workspaces = parseOutdatedRecursive(outdatedRaw)
  const totalPkgs = workspaces.reduce((sum, ws) => sum + ws.packages.length, 0)
  console.log(`found ${totalPkgs} outdated across ${workspaces.length} workspace(s).`)

  if (totalPkgs === 0) {
    console.log('all up to date ✓')
    return
  }

  // Step 3 – Resolve the effective registry (honours Aikido proxy, ~/.npmrc, etc.)
  const registryUrl = await getRegistryUrl()

  // Collect unique package+current pairs across all workspaces for deduped lookups
  const allPkgs = workspaces.flatMap((ws) => ws.packages)
  const uniqueKeys = new Set(allPkgs.map((p) => `${p.name}@${p.current}`))

  // When cooldown is active we need full packuments (for publish times) — warn about slower fetches
  const needTimes = cooldownCutoff > 0
  console.log(
    `Querying ${registryUrl} for latest in-series versions (${uniqueKeys.size} unique lookups, max ${MAX_JOBS} concurrent` +
      (needTimes ? ', full packuments for cooldown filtering' : '') +
      ') …',
  )

  // Deduped registry lookups — same package only fetched once
  const limit = createLimiter(MAX_JOBS)
  const lookupErrors: string[] = []
  const infoCache = new Map<string, PackageVersionInfo>()

  async function getInfoCached(
    pkgName: string,
    pkgNeedsTimes: boolean,
  ): Promise<PackageVersionInfo> {
    const cached = infoCache.get(pkgName)
    if (cached) return cached
    const info = await fetchPackageInfo(pkgName, registryUrl, pkgNeedsTimes)
    infoCache.set(pkgName, info)
    return info
  }

  // Step 4 – Resolve in-series version for each package across all workspaces
  interface WorkspaceResults {
    label: string
    results: Result[]
  }

  const workspaceResults: WorkspaceResults[] = await Promise.all(
    workspaces.map(async (ws) => {
      const results: Result[] = await Promise.all(
        ws.packages.map((pkg) =>
          limit(async () => {
            let series = 'N/A'

            // Determine if this package is exempt from cooldown
            const exempt = isCooldownExcluded(pkg.name, cooldown.excludePatterns)
            const pkgNeedsTimes = needTimes && !exempt
            const pkgCutoff = exempt ? 0 : cooldownCutoff

            try {
              const info = await getInfoCached(pkg.name, pkgNeedsTimes)
              series = latestInSeries(
                pkg.name,
                info.versions,
                pkg.current,
                info.publishTimes,
                pkgCutoff,
              )
            } catch (err) {
              const detail = err instanceof Error ? err.message : String(err)
              lookupErrors.push(`  ${pkg.name}: registry lookup failed (${detail})`)
            }
            return { ...pkg, series }
          }),
        ),
      )
      return { label: ws.label, results }
    }),
  )

  // Step 5 – Surface errors & render per-workspace tables
  if (lookupErrors.length > 0) {
    process.stderr.write(`\nWarning: ${lookupErrors.length} registry lookup(s) failed:\n`)
    for (const e of lookupErrors) process.stderr.write(e + '\n')
  }

  for (const ws of workspaceResults) {
    printTable(ws.results, ws.label, cooldownHours)
  }

  const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
  console.log(`Done in ${elapsed}s.`)
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
