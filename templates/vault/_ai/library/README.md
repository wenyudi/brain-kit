---
title: Library guide (collected material)
type: note
created: 2026-08-28
tags:
- meta
permalink: {{LIBRARY_PROJECT}}/readme
---

# Library (for AI — the reading room)

Collected external material: articles, video transcripts, papers, threads. Reader is AI (basic-memory project `{{LIBRARY_PROJECT}}`, semantic search); humans browse only occasionally via Obsidian. This is NOT the memory repo — public content is welcome here. The private part is the curation: *which* sources the user chose, *why*, and *what they said about them*.

## Layout

- `raw/` — **immutable originals**. Verbatim full text, original language, never edited after ingest (lint watches for modifications). Known exception: basic-memory stamps `permalink`/normalizes frontmatter once on first index (observed 2026-08-28 despite `ensure_frontmatter_on_sync: false`) — commit that stamp as the baseline; the sentinel guards everything after. Naming: `YYYY-MM-DD-<slug>.md` (Chinese kept). Frontmatter: `title`, `type: raw`, `collected: YYYY-MM-DD`, `url` (or `origin` when no URL exists), `lang`, `source`, `site`, plus **`note`** (the user's collection note, verbatim) and **`highlights`** (passages they marked) when present, plus any traceability fields the clipper provided (`author`, `published`, `bvid`, `cid`, `clipped`), plus ingest bookkeeping (`assets`, `assets_failed`, `transcript`, `media`, `ingested`).
- `assets/<raw-basename>/` — images localized at ingest (2026-09-02). Remote image links rot; `ingest.js` downloads every one before the raw is frozen, rewrites the link to `../assets/...`, and keeps the original URL in the image title (`data-src` for `<img>`). **Not in git** (2026-09-03 decision: it would blow the remote); local only, optionally rsynced nightly to the directory in `_system/vault.json` `assetsBackup`. A fresh clone has raw text with local image links but no images until the backup is restored. Failures keep the remote link and count in `assets_failed`; `brain ingest --repair-assets` retries.
- Audio/video for ASR live **outside the vault** at `<vault parent>/library-media/<raw-basename>/` (not git, not synced); raw frontmatter `media:` points there.
- `sources/` — **one page per raw item**, two depths:
  - `depth: stub` — generated mechanically by `ingest.js` when the item arrived with no collector note. Three facts: what it is, why collected = none recorded, provenance. Zero LLM. Deepen on request (「消化 X」) by rewriting it as a deep page.
  - `depth: deep` — the real digest, written in English by the LLM, spec below. Written eagerly for every item that arrives **with a note or highlights**.
  - Frontmatter: `title`, `type: source`, `depth`, `raw: <raw filename>` (this link is how the backlog sentinel knows the item is digested), `url`, `created`, `tags`.
- `sources/` also holds `type: synthesis` pages — **lazy-compiled only**: write one when ~3 sources on the same theme have accumulated, never eagerly.

## Source page spec (the anti-thin-digest contract, depth: deep)

The whole point of this layer is that a 2-bullet summary loses the argument forever. A deep source page keeps:

1. **TL;DR** — a few lines.
2. **Argument structure** — the reasoning chain and section logic, not just conclusions. Preserve conditions, exceptions, qualifiers. Passages the user highlighted get expanded first.
3. **Key quotes** — verbatim, original language, enough to re-anchor claims without re-reading raw.
4. **Why collected** — **the user's note, quoted verbatim** (from raw `note`), then one line of context if the conversation gave any. If there is no note, the item is a stub, not a deep page — do not invent a reason and do not ask.
5. **Caveats on the source itself** — marketing, bias, unverified claims, ASR-transcript quality.
6. `## Observations` / `## Relations` — feed the knowledge graph; link related sources and memory notes with `[[...]]`.

If the user's note carries a judgment, reaction, or lesson (not just "for project X"), that part is private evidence: write it into `_ai/memory/` (craft/ or journal) with a Relation back to this source page. The article is public; the user's reading of it is not.

## Rules

- **Admission = curation.** The user collected it → it belongs. No second gate. Obvious accidents (shopping pages, one-off lookups) still land as stubs; the user deletes them when the digest names them.
- **Entry points**: a path/link pasted in conversation (the user's message is the note) · Obsidian Web Clipper → vault `inbox/` (template has a `note` property, `## 我` and `## 划线` sections) · Bilibili subtitle clipper → `inbox/` (custom property `note`, extra section `我`). Intake is mechanical: `brain ingest` runs at 06:00 and on demand, lands raw + assets, writes stubs, removes the inbox file, commits. The LLM only touches items that carry a note.
- **No-subtitle Bilibili videos**: ingest pulls audio with yt-dlp and transcribes with faster-whisper (CPU); the transcript is written into the raw's `## 字幕` section with a first-line provenance banner (`ASR: faster-whisper <model> …`), frontmatter `transcript: asr:<model>`. Treat ASR text as lossy (names, numbers). `transcript: uploader` means real subtitles.
- **English for deep/synthesis pages; raw stays verbatim original language.** Stubs are English boilerplate.
- **Red line: no credentials/keys/tokens**, same as everywhere.
- Commit with the vault repo (single repo since 2026-08-28); batch writes get committed immediately, don't bet on the Stop hook. `ingest.js` commits its own batch.
