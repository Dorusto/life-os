/**
 * Test harness for the chat stream framing fix (audit 2026-09-15 finding 49).
 *
 * Run from frontend/:  node src/lib/__tests__/chat-stream.test.mjs
 *
 * Requires no test runner — compiles the real parser + API client with the
 * project's own TypeScript into a temp dir, then exercises:
 *   1. parser: two half-JSON chunks + one complete card → 3 objects, none lost
 *   2. parser: prose + split card → text preserved, card parsed
 *   3. parser: braces/escaped quotes inside JSON strings, split mid-string
 *   4. parser: balanced-but-invalid prose braces → text passthrough
 *   5. end-to-end sendChatMessageStreaming() over a chunked ReadableStream
 *   6. abort mid-stream → silent (no onError / onComplete / further onChunk)
 */

import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import assert from 'node:assert/strict'

const here = path.dirname(fileURLToPath(import.meta.url))
const frontendDir = path.resolve(here, '../../..')
const tscBin = path.join(frontendDir, 'node_modules/.bin/tsc')
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-stream-harness-'))

const compile = spawnSync(tscBin, [
  'src/lib/chatStreamParser.ts',
  'src/lib/api.ts',
  'src/lib/auth.ts',
  'src/lib/abConnectionStatus.ts',
  '--outDir', outDir,
  '--module', 'commonjs',
  '--target', 'es2022',
  '--lib', 'es2022,dom,dom.iterable',
  '--moduleResolution', 'node',
  '--esModuleInterop',
  '--skipLibCheck',
  '--strict',
  '--jsx', 'react-jsx',
], { cwd: frontendDir, encoding: 'utf8' })

if (compile.status !== 0) {
  console.error('tsc failed:\n' + compile.stdout + '\n' + compile.stderr)
  process.exit(1)
}

// auth.ts reads localStorage inside functions (never at import time).
globalThis.localStorage = {
  getItem: () => 'harness.jwt.token',
  setItem: () => {},
  removeItem: () => {},
}

const require = createRequire(import.meta.url)

// tsc computes rootDir from the whole program (the type-only Chart import
// pulls in src/components), so emitted files may be nested — locate by name.
function findCompiled(name, dir = outDir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const hit = findCompiled(name, p)
      if (hit) return hit
    } else if (entry.name === name) {
      return p
    }
  }
  return null
}

const { extractStreamEvents } = require(findCompiled('chatStreamParser.js'))
const { sendChatMessageStreaming } = require(findCompiled('api.js'))

const enc = new TextEncoder()
const sleep = ms => new Promise(r => setTimeout(r, ms))

const CARD1 = '{"type":"proposal","id":"p1","payee":"Shell","amount":50}'
const CARD2 = '{"type":"chart","title":"Monthly","data":{"x":[1,2],"y":3}}'
const CARD3 = '{"type":"info","message":"Done"}'

function kinds(events) {
  return events.map(e => e.kind + ':' + e.value)
}

// --- 1. Two half-JSON chunks + one complete card → 3 objects, none lost ---
{
  const c1 = CARD1.slice(0, 20)
  const c2 = CARD1.slice(20) + CARD2.slice(0, CARD2.length - 8)
  const c3 = CARD2.slice(CARD2.length - 8) + CARD3
  const all = [extractStreamEvents(c1)]
  let r = all[0].rest
  for (const c of [c2, c3]) {
    const res = extractStreamEvents(r + c)
    all.push(res)
    r = res.rest
  }
  const jsons = all.flatMap(s => s.events).filter(e => e.kind === 'json').map(e => e.value)
  assert.equal(r, '', 'buffer must be empty at end of stream')
  assert.deepEqual(jsons, [CARD1, CARD2, CARD3], '3 complete objects parsed, none lost')
  console.log('PASS 1  split chunks: 3 objects parsed, none lost')
}

// --- 2. Prose + split card: text preserved in order, card parsed ---
{
  let r = ''
  const jsons = [], texts = []
  for (const c of ['Here is your ', 'summary.' + CARD1.slice(0, 25), CARD1.slice(25)]) {
    const res = extractStreamEvents(r + c)
    r = res.rest
    for (const e of res.events) (e.kind === 'json' ? jsons : texts).push(e.value)
  }
  assert.deepEqual(jsons, [CARD1])
  assert.equal(texts.join(''), 'Here is your summary.')
  console.log('PASS 2  prose + split card: text preserved, card parsed')
}

// --- 3. Braces and escaped quotes inside JSON strings, split mid-string ---
{
  const card = '{"type":"proposal","id":"p2","note":"use } braces { and \\"quotes\\"","amount":1}'
  let r = ''
  const jsons = []
  for (const c of [card.slice(0, 30), card.slice(30)]) {
    const res = extractStreamEvents(r + c)
    r = res.rest
    jsons.push(...res.events.filter(e => e.kind === 'json').map(e => e.value))
  }
  assert.equal(r, '')
  assert.deepEqual(jsons, [card], 'object with } and { inside strings parses as ONE object')
  assert.equal(JSON.parse(jsons[0]).note, 'use } braces { and "quotes"')
  console.log('PASS 3  string-awareness across chunk boundary')
}

// --- 4. Balanced-but-invalid prose braces pass through as text; real card still parsed ---
{
  const res = extractStreamEvents('Use {curly} braces. ' + CARD3)
  const text = res.events.filter(e => e.kind === 'text').map(e => e.value).join('')
  const jsons = res.events.filter(e => e.kind === 'json').map(e => e.value)
  assert.equal(text, 'Use {curly} braces. ')
  assert.deepEqual(jsons, [CARD3])
  console.log('PASS 4  prose braces: passthrough as text, card unaffected')
}

// --- 5. End-to-end: real sendChatMessageStreaming over chunked reads ---
{
  const c1 = CARD1.slice(0, 20)
  const c2 = CARD1.slice(20) + CARD2.slice(0, CARD2.length - 8)
  const c3 = CARD2.slice(CARD2.length - 8) + CARD3
  const chunks = ['Here is your ', c1, c2, c3]
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c))
      controller.close()
    },
  })
  const realFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(stream, { status: 200 })
  try {
    const received = []
    let completed = false, error = null
    await sendChatMessageStreaming('m', [], c => received.push(c), () => { completed = true }, e => { error = e })
    assert.equal(error, null)
    assert.equal(completed, true)
    assert.deepEqual(received, ['Here is your ', CARD1, CARD2, CARD3],
      'consumer sees only complete units, in order')
    console.log('PASS 5  end-to-end streaming: 4 network reads → 4 complete units')
  } finally {
    globalThis.fetch = realFetch
  }
}

// --- 6. Abort mid-stream: silent, no error surfaced ---
{
  let streamController
  const stream = new ReadableStream({
    start(controller) {
      streamController = controller
      // Complete text unit — emits immediately; a partial JSON fragment
      // would (correctly) be held in the buffer and never fire onChunk.
      controller.enqueue(enc.encode('Reply so far. '))
      // never closes — stream would keep running
    },
  })
  const realFetch = globalThis.fetch
  globalThis.fetch = async (_url, init) => {
    init.signal.addEventListener('abort', () => {
      streamController.error(new DOMException('The operation was aborted.', 'AbortError'))
    })
    return new Response(stream, { status: 200 })
  }
  try {
    const received = []
    let completed = false, error = null
    const ac = new AbortController()
    const p = sendChatMessageStreaming('m', [], c => received.push(c), () => { completed = true }, e => { error = e }, ac.signal)
    await sleep(100)
    assert.equal(received.length, 1, 'first chunk consumed before abort')
    ac.abort()
    await p // must resolve silently, never throw
    await sleep(50)
    assert.equal(received.length, 1, 'no further onChunk after abort')
    assert.equal(completed, false, 'onComplete not called on abort')
    assert.equal(error, null, 'onError not called on abort')
    console.log('PASS 6  abort mid-stream: silent, no user-visible error')
  } finally {
    globalThis.fetch = realFetch
  }
}

fs.rmSync(outDir, { recursive: true, force: true })
console.log('All 6 tests passed.')
