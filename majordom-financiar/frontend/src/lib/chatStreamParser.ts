/**
 * Chat stream framing (backend/api/chat.py): the POST /api/chat response is a
 * raw text/plain stream with no delimiters. It interleaves two kinds of data:
 * LLM text deltas (plain prose fragments, yielded as they arrive) and
 * confirmation-card payloads (complete, compact, top-level JSON objects —
 * json.dumps with no indent, so no embedded newlines — yielded whole when a
 * proposal/chart/status tool runs). TCP does not preserve the backend's write
 * boundaries, so a card can be split across two network reads; feeding a raw
 * chunk to JSON.parse then loses the card as visible raw JSON
 * (audit 2026-09-15 finding 49).
 *
 * extractStreamEvents() turns a raw stream buffer into complete units: every
 * top-level JSON object becomes a "json" event, the prose between objects
 * becomes "text" events (passthrough — nothing is dropped or reordered). A
 * JSON object whose braces have not balanced yet stays in `rest` until a
 * later read completes it, so only complete objects ever get parsed/handled.
 * Balanced-but-invalid brace groups (prose like "use {x}") are passed through
 * as text so ordinary prose can never trap the buffer.
 */

export interface StreamEvent {
  kind: 'json' | 'text'
  value: string
}

export function extractStreamEvents(
  buffer: string
): { events: StreamEvent[]; rest: string } {
  const events: StreamEvent[] = []
  let pos = 0

  while (pos < buffer.length) {
    const start = buffer.indexOf('{', pos)
    if (start === -1) {
      events.push({ kind: 'text', value: buffer.slice(pos) })
      break
    }
    if (start > pos) {
      events.push({ kind: 'text', value: buffer.slice(pos, start) })
    }

    // Scan for the matching closing brace, skipping string literals so
    // braces and quotes inside JSON string values don't affect depth.
    let depth = 0
    let inString = false
    let escaped = false
    let end = -1
    for (let j = start; j < buffer.length; j++) {
      const ch = buffer[j]
      if (inString) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') inString = false
      } else if (ch === '"') {
        inString = true
      } else if (ch === '{') {
        depth++
      } else if (ch === '}') {
        depth--
        if (depth === 0) {
          end = j
          break
        }
      }
    }

    if (end === -1) {
      // Incomplete object — hold it (and only it) until the next read.
      return { events, rest: buffer.slice(start) }
    }

    const candidate = buffer.slice(start, end + 1)
    let valid = false
    try {
      JSON.parse(candidate)
      valid = true
    } catch {
      // Balanced but not JSON — prose braces ("use {x} like this").
      // Passed through as text below, same content, same position.
    }
    events.push({ kind: valid ? 'json' : 'text', value: candidate })
    pos = end + 1
  }

  return { events, rest: '' }
}
