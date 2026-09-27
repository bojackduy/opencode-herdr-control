import { execSync } from "node:child_process";

/**
 * Check if we're running inside a herdr environment.
 */
export function isInHerdr(): boolean {
  return process.env.HERDR_ENV === "1";
}

/**
 * Get the current pane ID.
 * First checks HERDR_PANE_ID env var, then falls back to `herdr pane list --json`.
 */
export async function getCurrentPaneId($: any): Promise<string | null> {
  if (process.env.HERDR_PANE_ID) {
    return process.env.HERDR_PANE_ID;
  }

  try {
    const result = await $`herdr pane list --json`.quiet().nothrow();
    const text = result.text?.() ?? result.stdout?.toString() ?? String(result);
    if (!text) return null;

    const parsed = JSON.parse(text);
    const focused = parsed?.panes?.find((p: any) => p.focused === true);
    return focused?.pane_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Split a pane in the given direction and return the new pane ID.
 */
export async function splitPane(
  $: any,
  direction: "right" | "down",
  fromPaneId: string
): Promise<string | null> {
  try {
    const result =
      $`herdr pane split ${fromPaneId} --direction ${direction} --no-focus`
        .quiet()
        .nothrow();
    const text = await result;
    const parsed = JSON.parse(text.toString());
    return parsed?.result?.pane?.pane_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Run a command in a specific pane. Fire and forget.
 * Accepts individual arguments for safe shell interpolation.
 */
export async function runInPane(
  $: any,
  paneId: string,
  ...commandParts: string[]
): Promise<void> {
  try {
    await $`herdr pane run ${paneId} ${commandParts}`.quiet().nothrow();
  } catch {
    // fire and forget
  }
}

/**
 * Close a pane. Silently ignores all errors.
 */
export async function closePane($: any, paneId: string): Promise<void> {
  try {
    await $`herdr pane close ${paneId}`.quiet().nothrow();
  } catch {
    // silently swallow all errors
  }
}

// Memoize only a SUCCESSFUL resolution. Plugins initialize before OpenCode's
// server starts listening, so an early failure must not be cached forever.
let _resolvedServerUrl: string | null = null;
let _warned = false;

function normalizeUrl(raw: string | URL | undefined | null): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw.toString());
    // Port "" or "0" means "not bound yet" — unusable for `opencode attach`
    if (!parsed.port || parsed.port === "0") return null;
    if (parsed.hostname === "0.0.0.0" || parsed.hostname === "[::]") {
      parsed.hostname = "localhost";
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/**
 * Resolve the OpenCode server URL. Call lazily (at split time), not at init.
 * Order: serverUrl provided by OpenCode → OPENCODE_SERVER_URL → lsof on own pid.
 */
export function resolveServerUrl(provided?: string | URL | null): string | null {
  if (_resolvedServerUrl) return _resolvedServerUrl;

  const url =
    normalizeUrl(provided) ??
    normalizeUrl(process.env.OPENCODE_SERVER_URL) ??
    lsofListenUrl();

  if (url) {
    _resolvedServerUrl = url;
    return url;
  }

  if (!_warned) {
    _warned = true;
    console.warn(
      "opencode-herdr-control: Could not resolve OpenCode server URL; subagent auto-splits skipped. herdr_* tools are unaffected."
    );
  }
  return null;
}

function lsofListenUrl(): string | null {
  try {
    const output = execSync(
      `lsof -nP -a -p ${process.pid} -iTCP -sTCP:LISTEN`,
      { encoding: "utf-8", timeout: 3000 }
    );
    const match = output.match(/:(\d+)\s+\(LISTEN\)/);
    return match ? `http://localhost:${match[1]}` : null;
  } catch {
    return null;
  }
}
