---
title: AI memory guide
type: note
created: 2026-08-26
tags:
- meta
permalink: {{MEMORY_PROJECT}}/readme
---

# AI Memory (for AI — humans don't read here)

This is the AI memory of vault {{NAME}} (basic-memory project `{{MEMORY_PROJECT}}`, at `_ai/memory/` inside the vault). **The reader is AI, not a human** — write for retrieval, not for reading. Human-facing content lives in the vault's top level under its own style rules (人话规范); collected external material lives next door in `_ai/library/` (see its README). Don't mix the three.

## Writing rules

- **Write in English** (2026-08-27 decision): titles, filenames, body, observations, tags. LLMs retrieve and reason better over English. Exceptions: verbatim quotes kept as evidence, proper nouns, and command/path literals stay in their original language. The corpus started fresh in English (2026-08-27: Chinese legacy discarded per user decision — do NOT restore it from git history); embeddings stay multilingual so Chinese-language queries keep working.
- Format: markdown + frontmatter (`title`/`type`/`tags`/`created`), free-form body, then `## Observations` (`- [category] fact #tag`) and `## Relations` (`- verb [[Target Title]]`) to feed the knowledge graph
- Density is your call; telegraph style welcome. No prose polish needed — retrieval-friendliness first
- **Admission is a blocklist, not a whitelist (2026-09-01, flipped from the old privacy-only rule): record by default.** When in doubt, write it down — lived events, attempts (including failed ones), decisions with reasons, environment facts, user preferences, unverified hunches (marked as hunches). Write-time predictions of future usefulness are unreliable; discarded detail is unrecoverable. Only three exclusions: (1) pure public knowledge with zero binding to this user's context — the one real source of retrieval noise; collected public material goes to `_ai/library/` instead; (2) credentials/keys/tokens; (3) keystroke-level noise — journal records events, not command-by-command transcripts or bulk output. Stateful facts carry a date; when a fact is overturned, `edit` the note rather than leaving a misleading stale version.
- **Red line: credentials/keys/tokens never enter** (the vault's protect-secrets guard now covers this area too, but the rule stands regardless)
- Directories: `craft/` lessons · `playbooks/` compiled tactics · `journal/` event log · `tasks/` todos (frontmatter `due: YYYY-MM-DD`, `status: open|done`)
- **Every reusable lesson gets its own craft/ page (2026-09-02)**: a `[lesson]` observation in journal is raw material, not a destination. When you write one, also write (or update) a `craft/` note — one lesson per note, self-contained (what happened, mechanism, the rule, how to check), dated, with `## Relations` back to the journal day and to any human-layer page it feeds. journal keeps the event and links the craft note. brief/lint carry a lesson-vs-craft gap sentinel (`LESSON_CRAFT_GAP` in brain-tools/lib.js) that fires when lessons pile up unsplit.
- **Collection notes are private evidence (2026-09-02)**: when a library item arrives with the user's `note`/`highlights` and the note carries a judgment, reaction, or lesson (not just "for project X"), write that part here (craft/ or journal) with a Relation to the source page. The article is public and lives in `_ai/library/`; what the user thought about it lives here.
- **Auto-harvest provenance (2026-09-02)**: notes written by the nightly `brain-tools/harvest-sweep.js` carry `provenance: auto-harvest` and `session: <jsonl path>`. They are unreviewed distillations of a condensed transcript — trust them like a colleague's notes, not like a verified fact; the weekly digest names them so the user can glance. Correct with `edit`, never leave a wrong one standing.
- **One entity per note — split before it bloats (2026-09-01 anti-monolith rule)**: when a `craft/` or `playbooks/` note passes ~150 lines, split by subtopic and wire the pieces with Relations instead of appending forever; retrieval works on small pages + dense links. `journal/` is exempt — one file per day, never merged, any length. lint/brief carry an oversize sentinel for this.

## After writing

Commit in the vault repo: `git -C <vault root> add -A && git commit -m "<one line>"` — right after batch writes, don't bet on the Stop hook. The daily chain (`brain daily`) pushes.
