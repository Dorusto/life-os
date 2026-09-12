# Building a new standalone companion app — reusable process

Written 2026-09-12 after building `vehicle-manager`'s standalone frontend (Phases 1-5, see
`vehicle-manager/docs/standalone-app-plan.md` for the concrete instance) end to end via `/loop`.
This doc extracts what's reusable from that run for the next one — the investment/portfolio app
(#262) — so the process doesn't have to be re-derived from scratch, and so the two real mistakes
made along the way don't repeat.

**What this is:** a checklist + a set of hard-won defaults for the specific shape "an independent
service, own frontend + backend + database, own docker-compose entry, talks to majordom-financiar
only over REST" — the shape decided in `majordom-financiar/docs/decisions.md#portfolio-becomes-separate-service`
for both vehicle-manager and the investment app. **What this is not:** a fixed phase list to copy
verbatim — vehicle-manager's phases (migrate existing logic → auth → scaffold → pages → retire old
UI) fit *that* app because it already existed as a backend service with logic embedded in
majordom-financiar's frontend. A brand-new app (investment) has no "migrate existing logic" phase
and probably no "retire old in-app UI" phase either (nothing was ever built for portfolio in
majordom-financiar — Ghostfolio was dropped before integration). Write the actual plan doc's
phases from the real starting point of the new app, not by copying vehicle-manager's list.

## 1. Before writing any phase

Run `/plan-feature`'s checklist against the new app's own docs once they exist, and write a
`docs/standalone-app-plan.md`-equivalent for it (current state → target shape → phases → critical
rules → circuit breaker), same as vehicle-manager's. Genuinely open questions (data model, which
external price API, auth shape) get resolved with Doru as design/architecture questions per
`majordom-financiar/CLAUDE.md`'s "decide pure-technical calls yourself, surface real forks" rule
— not invented mid-implementation.

## 2. Decide these two things upfront, in the plan doc, before Phase 1 code

Getting these wrong wasn't fatal but cost a real post-merge bug and a rebuild cycle this time —
cheaper to decide once at the start than to retrofit after a frontend has more than one route.

1. **The new frontend's Nginx puts the backend API behind a distinct path prefix (`/api/`,
   stripped before forwarding) from the very first commit that adds a second frontend route.**
   Vehicle-manager's Phase 3 scaffold proxied bare `/vehicles/`, `/auth/`, etc. directly — worked
   fine with exactly one frontend route (`/`), then broke silently the moment Phase 4 added
   `/vehicles/:id` as a *frontend* route with the same path shape as the *backend's* own
   `/vehicles/*` API prefix. An unauthenticated page load (hard refresh, bookmark, deep link) hit
   the JSON API instead of the SPA shell. Same fix majordom-web's own `nginx.conf` already uses,
   for the same reason — just apply it from the start instead of rediscovering it.
2. **Auth: a per-user JWT (the new app's own login) plus a separate service-token header
   (`X-Service-Token`, `hmac.compare_digest`, fails closed if unconfigured) for
   majordom-financiar's internal calls** — see `vehicle-manager/app/auth.py` as the reference
   implementation. Security-sensitive → implement this phase directly, never delegate it (see §4).

## 3. Delegation-tier decisions — ask, don't infer

Follow `~/.claude/skills/delegate-by-complexity/SKILL.md`'s rubric as normal. Two rules from it
matter most for a multi-phase app build specifically:

- **Before any Senior-tier dispatch (DeepSeek Pro OR a Claude fork for a big/foundational task),
  stop and ask Doru which vehicle he wants — every single time, not just the first time in a
  session.** Don't infer from the previous answer. This session asked twice (Phase 3 scaffold,
  Phase 4 real pages) and got "Claude fork" both times, but the question was asked fresh each
  time per the standing rule.
- **File count is a signal independent of per-file difficulty.** A frontend scaffold or a new
  detail-page-with-charts-and-forms touches 10+ files even when each one is individually simple
  — that alone pushes it to Senior tier.

## 4. What to implement directly, never delegate

Per `delegate-by-complexity`'s own rubric: auth/security-sensitive code, and any real
architecture decision. Concretely, for this app shape: the JWT+service-token auth module, and
any Nginx/routing-layer decision (like §2.1 above) — these are exactly the two places this
session found a real bug or a real security property worth getting right by hand rather than
via a spec handed to a fork.

## 5. Dispatching a Claude fork for a phase — the prompt discipline that actually held

The first fork this session (Phase 3) was told once, in the middle of a long spec, not to commit
— it committed anyway, and separately started an unrequested next phase in a stray worktree
(caught and cleaned up, no real harm, but wasted a review cycle). The second fork (Phase 4) got
the same instruction restated as an unmissable, standalone paragraph at the very top of the
prompt *and* repeated at the very bottom — and it held. Concretely, for every fork dispatch on a
multi-phase build:

- **State "do not commit, do not touch git, do not start any work beyond this list" as its own
  bolded section before the task spec even begins** — not folded into a "Critical rules" bullet
  list buried in the middle of a long prompt.
- **Repeat the same constraint in the "Report back" section at the end.**
- Give the fork every concrete file reference, exact endpoint list, and exact field names you
  already gathered by reading the code yourself — a fork inherits your conversation context, so
  this is "don't make it re-derive research," not "explain background."
- Explicitly scope out anything adjacent-but-not-asked-for that the fork might reasonably infer
  belongs ("while I'm at it, I'll also add an edit-vehicle modal") — list what's *out* of scope,
  not just what's in.

## 6. Verifying a fork's (or Aider's) "done, verified" report — never trust it as-is

Both this session's forks gave plausible, detailed completion reports. One was later found to
have committed against instructions (caught by `git log`/`git status`, not by reading the report
text). The other's own verification never exercised the exact code path where a real bug lived —
because it only tested via authenticated `curl` calls, which behave like the SPA's *own*
`fetch()` calls after the shell has already loaded, never like a browser's *first* request for a
page (no token attached, `Accept: text/html`). That's exactly where the `/api/` prefix bug in §2.1
lived, and it was only caught by testing the unauthenticated first-load path directly, by hand,
after the fork reported success.

Checklist before accepting any delegated/forked diff as done:
1. `git status`/`git diff --stat` on the real repo — confirm scope, confirm no unauthorized
   commit, confirm no stray worktree/branch (`git worktree list`).
2. Read every changed/new file yourself, in full — not just skim the diff.
3. Rebuild from scratch yourself (`tsc --noEmit`, `npm run build`, `docker build`) — don't reuse
   the fork's own build artifacts as proof.
4. Live-test the *cold* path explicitly, not just the steady-state path a convenience script
   exercises — for a web app, that means an actual unauthenticated request to every new SPA
   route, not just authenticated API calls.
5. Only then merge/commit — as yourself, in the main checkout, never let the fork do it.

## 7. Known `check-private-data.sh` false-positive classes (don't touch the regex — work around it)

These will recur on any new app in this monorepo; diagnosing the exact matched substring
mechanically (`grep -ioP '<pattern>' <<< '<line>'`) before deciding how to fix it is faster than
guessing at a rephrase. See the script's own inline comments for the full current list; two hit
again this session, worth calling out specifically:

- **A brand-new file's `SECRET = os.getenv(...)` line looks identical to already-safe, already-
  committed code, but gets flagged anyway** — because the scanner only checks *diff* lines, and a
  new file's every line counts as "added." Confirmed the identical pattern is already whitelisted
  (`os\.getenv\(` is in the credential-value regex's negative lookahead) before assuming a new
  file needs a new fix.
- **Two adjacent Tailwind utility classes with a 2-letter prefix and a 2-3 digit value (e.g. a
  padding-top and padding-bottom pair) coincidentally match the license-plate regex**, regardless
  of order — any `[letters][digits][letters]` shape spanning a space triggers it. Fix by
  converting one value to Tailwind's arbitrary-value bracket syntax (same visual result, breaks
  the character-shape match) — never by touching the shared regex.
- **Placeholder secrets must start with `your_`/`paste_`/`change_`/`example`** — `generate_...` is
  not on that whitelist despite being used in an already-committed file. Use `change_this_to_...`
  for any new placeholder.

## 8. Per-phase documentation discipline (don't defer it all to the end)

Each phase, as it lands: mark it `✅ done` in the app's own plan doc with what actually happened
(not just what was planned), add a dated entry to `majordom-financiar/docs/sessions/YYYY-WNN.md`
and a row in `INDEX.md`, and update `docs/architecture.md`'s live-architecture prose (not the
aspirational target tree) if the new service changes anything about how majordom-financiar
relates to it. If a phase surfaces genuine dead code or a real follow-up too small to act on
immediately, file it as its own GitHub issue (`priority-tracking.md`: status/follow-ups live on
GitHub, not buried in a session log) rather than leaving a vague "todo" note.

## 9. When to stop the loop

Stop at the checkpoint the user actually asked for — for vehicle-manager, that was explicitly
"the whole app done and tested, standalone and integrated" (Doru's own framing when this plan was
proposed), not a phase-by-phase check-in. Don't invent an extra phase past that boundary (the
stray Phase-4a worktree this session was exactly that mistake, though contained early with no
real damage) — when the plan doc's last phase is done and live-verified, stop the loop
(`ScheduleWakeup({stop: true})`) and hand back to the user, rather than continuing into a
follow-up you weren't asked for.
