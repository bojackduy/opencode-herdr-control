import type { Plugin } from "@opencode-ai/plugin"
import { isInHerdr, getCurrentPaneId, splitPane, runInPane, closePane, resolveServerUrl } from "./herdr"
import { loadConfig } from "./config"
import { createHerdrTools } from "./tools"

const plugin: Plugin = async ({ $, serverUrl: providedServerUrl }) => {
  const herdrTools = createHerdrTools()

  // Early exit if not in herdr — still expose tools (they fail with clear error outside herdr)
  if (!isInHerdr()) {
    return {
      tool: herdrTools,
      async event() {
        // Complete no-op outside herdr
      },
    }
  }

  // Load config at startup. Server URL is resolved lazily at split time:
  // plugins init before OpenCode's server is listening.
  const config = loadConfig()
  const originalPaneId = await getCurrentPaneId($)

  // State
  const activeSplits = new Map<string, string>() // sessionID → paneID
  const rowFrontier: (string | undefined)[] = [undefined, undefined, undefined]
  let agentCount = 0
  let splitQueue: Promise<unknown> = Promise.resolve(undefined)

  // --- Queue: serialize all split/close operations ---
  function enqueueSplitOp<T>(fn: () => Promise<T>): Promise<T> {
    const result = splitQueue.then(fn, fn)
    splitQueue = result.then(
      () => {},
      () => {},
    )
    return result as Promise<T>
  }

  // --- Grid state reset ---
  function resetGridState(): void {
    rowFrontier[0] = undefined
    rowFrontier[1] = undefined
    rowFrontier[2] = undefined
    agentCount = 0
  }

  // --- Remove and close a subagent pane ---
  function removeAndClose(sessionId: string): void {
    const paneId = activeSplits.get(sessionId)
    if (!paneId) return
    activeSplits.delete(sessionId)

    // Invalidate stale frontier entries pointing to the closed pane
    for (let i = 0; i < rowFrontier.length; i++) {
      if (rowFrontier[i] === paneId) {
        rowFrontier[i] = originalPaneId ?? undefined
      }
    }

    closePane($, paneId).catch(() => {})
    if (activeSplits.size === 0) {
      resetGridState()
    }
  }

  // --- Grid layout: determine split direction and source pane ---
  function getGridLayout(): { direction: "right" | "down"; fromPaneId: string | null } {
    const n = agentCount

    if (n === 0) {
      // 1st subagent: split right from original pane
      return { direction: config.direction, fromPaneId: originalPaneId }
    } else if (n === 1) {
      // 2nd subagent: split down from frontier[0]
      return { direction: "down", fromPaneId: rowFrontier[0] ?? null }
    } else if (n === 2) {
      // 3rd subagent: split down from original pane
      return { direction: "down", fromPaneId: originalPaneId }
    } else {
      // 4th+ subagent: split right from appropriate row frontier
      const rowIdx = (n - 3) % 3
      return { direction: "right", fromPaneId: rowFrontier[rowIdx] ?? null }
    }
  }

  // --- Update grid state after a successful split ---
  function updateGridState(paneId: string): void {
    if (agentCount < 3) {
      rowFrontier[agentCount] = paneId
    } else {
      const rowIdx = (agentCount - 3) % 3
      rowFrontier[rowIdx] = paneId
    }
    agentCount++
  }

  return {
    tool: herdrTools,
    async event({ event }) {
      const e = event as any

      // --- session.created: create split for child sessions ---
      if (e.type === "session.created") {
        if (!config.splits) return
        if (!e.data?.parentID) return
        const serverUrl = resolveServerUrl(providedServerUrl)
        if (!serverUrl) return
        const sessionId = e.data?.id
        if (!sessionId) return
        if (activeSplits.has(sessionId)) return

        await enqueueSplitOp(async () => {
          if (activeSplits.has(sessionId)) return // Re-check after await

          const { direction, fromPaneId } = getGridLayout()
          if (!fromPaneId) return

          const newPaneId = await splitPane($, direction, fromPaneId)
          if (!newPaneId) return // Split failed — skip this subagent

          // Run opencode attach in the new pane
          await runInPane($, newPaneId, "opencode", "attach", serverUrl, "--session", sessionId)

          // Store mapping and update grid
          activeSplits.set(sessionId, newPaneId)
          updateGridState(newPaneId)
        })

        return
      }

      // --- session.status: auto-close idle subagents ---
      if (e.type === "session.status") {
        if (!config.autoClose) return
        const sessionId = e.data?.id
        const status = e.data?.status?.type ?? e.data?.status
        if (status !== "idle") return

        // Only close subagent sessions (those with a parentID)
        // Check if this session is in activeSplits (which only contains subagents)
        if (sessionId && activeSplits.has(sessionId)) {
          removeAndClose(sessionId)
        }
        return
      }

      // --- session.deleted: close pane if mapped ---
      if (e.type === "session.deleted") {
        const sessionId = e.data?.id
        if (sessionId && activeSplits.has(sessionId)) {
          removeAndClose(sessionId)
        }
        return
      }

      // --- session.error: close pane if mapped ---
      if (e.type === "session.error") {
        const sessionId = e.data?.id ?? e.data?.sessionID
        if (sessionId && activeSplits.has(sessionId)) {
          removeAndClose(sessionId)
        }
        return
      }
    },
  }
}

export default plugin
