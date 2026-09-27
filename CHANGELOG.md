# Changelog

## 0.1.5 (2026-09-27)

- Fix: `herdr_agent_prompt` returns after submission by default instead of blocking the caller while the pane agent works. Waiting for Herdr's idle/done/blocked state remains available with `wait: true`; the tool and README clarify that this is distinct from Fleet's task-specific `DONE:` reply.

## 0.1.4 (2026-09-27)

- Fix: false startup warning "Could not resolve OpenCode server URL". The server URL is now resolved lazily at split time (preferring the URL OpenCode provides), failures are not cached, and the warning only appears when a split is actually skipped.

## 0.1.3 (2026-09-26)

- Fix: `herdr_workspace_create` / `herdr_tab_create` no longer create duplicates when a call is double-fired or retried — in-flight calls are shared and identical label+cwd results are reused for 90s. Create timeout raised to 120s.

## 0.1.1 (2026-09-25)

- License changed to AGPL-3.0-or-later, preserving the upstream MIT notice.

## 0.1.0 (2026-09-24) — Initial release

Forked from `gustavocaiano/opencode-herdr` (auto-split panes for subagent visibility) and renamed to `@bojackduy/opencode-herdr-control`.

- Explicit `herdr_*` tools for OpenCode agents: `herdr_status`, `herdr_pane_list` / `herdr_pane_split` / `herdr_pane_run` / `herdr_pane_read` / `herdr_pane_close` / `herdr_pane_send_text` / `herdr_pane_wait_output`, `herdr_tab_create`, `herdr_workspace_create`, `herdr_session_list`, `herdr_agent_start` / `herdr_agent_prompt`
- Full workflow: `workspace_create` → `pane_run` shell commands → `pane_read` → `agent_start opencode` → `agent_prompt`
- Config: `opencode-herdr-control.json` with legacy `opencode-herdr.json` fallback
