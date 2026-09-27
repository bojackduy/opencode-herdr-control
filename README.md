# opencode-herdr-control

OpenCode plugin for [herdr](https://github.com/nicholasgasior/herdr) control — survey workspaces/tabs/panes, run shell commands, launch opencode agents.

Forked from `opencode-herdr` (auto-split panes for subagent visibility). This fork diverges: explicit `herdr_*` tools so agents can create workspaces, interact with shells, and launch OpenCode to work in them.

When the OpenCode orchestrator delegates to a subagent (via the Task tool), this plugin automatically splits a new herdr pane and runs `opencode attach` inside it, giving you a live TUI view of each subagent's work. Panes close automatically when subagents complete.

## Requirements

- OpenCode ≥ 1.0
- herdr installed and running
- OpenCode started with `--port` flag (required for `opencode attach`)

## Installation

Add `@bojackduy/opencode-herdr-control` to your `opencode.json` plugin array:

```json
{
  "plugin": [
    "@bojackduy/opencode-herdr-control"
  ]
}
```

For local dev: `"plugin": ["file:/Users/duytrinh/Code/opencode-herdr"]`

## Configuration

Create `~/.config/opencode/opencode-herdr-control.json` (legacy `opencode-herdr.json` still works):

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `splits` | boolean | `true` | Enable/disable automatic pane splitting |
| `autoClose` | boolean | `true` | Auto-close panes when subagents go idle |
| `direction` | `"right"` \| `"down"` | `"right"` | Default split direction for the first subagent |

### Example

```json
{
  "splits": true,
  "autoClose": false,
  "direction": "right"
}
```

With `autoClose: false`, subagent panes remain open for manual inspection after completion. They still close on `session.deleted` and `session.error` events.

## Subagent Splits

When a subagent session is created, the plugin:

1. Splits a herdr pane using a grid layout strategy
2. Runs `opencode attach --session <id>` in the new pane
3. Tracks the session-to-pane mapping
4. Closes the pane when the subagent finishes (if `autoClose` is enabled)

**Note:** OpenCode must be started with `--port 0` (or any port) for `opencode attach` to work. Without this, the plugin will emit a one-time warning and skip all splits.

## Prompting a pane agent

`herdr_agent_prompt` invokes `herdr agent prompt <target> <text>` and returns the submission acknowledgement by default (`wait: false`). For a short turn, `wait: true` adds Herdr's `--wait --timeout`: it waits for the agent to reach idle, done, or blocked, **not** for a reply tied to this particular prompt. If the caller's tool run is aborted while waiting, the target may still be working; inspect its pane before considering another submission. Fleet's `fleet_exec` instead addresses an OpenCode session ID through its own direct/spool transport and waits for a `DONE:` reply.

## How It Works

| Event | Action |
|-------|--------|
| `session.created` (with `parentID`) | Split pane, run `opencode attach`, store mapping |
| `session.status` → `idle` (subagent) | Close pane (if `autoClose` enabled) |
| `session.deleted` | Close pane |
| `session.error` | Close pane |

The plugin is a complete no-op when not running inside herdr (no `HERDR_ENV=1`).

## Grid Layout

The plugin uses a row-based tiling pattern to create a readable grid instead of a single column:

```
┌──────────┬──────────┐
│ Original │ Agent 0  │  1st: split right from original
│          ├──────────┤
│          │ Agent 1  │  2nd: split down from Agent 0
├──────────┤          │
│ Agent 2  │          │  3rd: split down from original
└──────────┴──────────┘
```

4th+ agents split right from the appropriate row, cycling through rows.

## License

AGPL-3.0-or-later. Fork of [opencode-herdr](https://github.com/gustavocaiano/opencode-herdr) by Gustavo Caiano (MIT) — original notice preserved in LICENSE.
