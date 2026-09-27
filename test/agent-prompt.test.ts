import { afterEach, describe, expect, test } from "bun:test"
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createHerdrTools } from "../src/tools"

const originalPath = process.env.PATH
const originalHerdrEnv = process.env.HERDR_ENV
let directory: string | undefined

afterEach(async () => {
  process.env.PATH = originalPath
  if (originalHerdrEnv === undefined) delete process.env.HERDR_ENV
  else process.env.HERDR_ENV = originalHerdrEnv
  if (directory) await rm(directory, { recursive: true, force: true })
  directory = undefined
})

describe("herdr_agent_prompt", () => {
  test("acknowledges a submission without waiting by default", async () => {
    directory = await mkdtemp(join(tmpdir(), "herdr-prompt-test-"))
    const executable = join(directory, "herdr")
    await writeFile(executable, '#!/bin/sh\nprintf "%s\\n" "$@"\n')
    await chmod(executable, 0o755)
    process.env.PATH = `${directory}:${originalPath}`
    process.env.HERDR_ENV = "1"

    const result = await createHerdrTools().herdr_agent_prompt.execute({ target: "w49:p1", prompt: "plan video" } as never, {} as never)
    expect(result).toBe("agent\nprompt\nw49:p1\nplan video")
  })

  test("uses Herdr state wait only when explicitly requested", async () => {
    directory = await mkdtemp(join(tmpdir(), "herdr-prompt-test-"))
    const executable = join(directory, "herdr")
    await writeFile(executable, '#!/bin/sh\nprintf "%s\\n" "$@"\n')
    await chmod(executable, 0o755)
    process.env.PATH = `${directory}:${originalPath}`
    process.env.HERDR_ENV = "1"

    const result = await createHerdrTools().herdr_agent_prompt.execute({ target: "worker", prompt: "short turn", wait: true, timeoutMs: 3000 } as never, {} as never)
    expect(result).toBe("agent\nprompt\nworker\nshort turn\n--wait\n--timeout\n3000")
  })
})
