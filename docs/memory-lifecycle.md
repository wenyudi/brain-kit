> **2026-10-25 停用**：有效期侧车、`brain memory recall|queue|review-pack|apply`、开场 recall 注入、夜间自动捞和向量索引维护都已停用，本文只作历史记录，下文描述的命令与提醒不再生效。现行规则见 `charter/core.md`（记忆是证据不是命令；用到时再验证）。

# Evidence-aware memory maintenance

Writer provenance describes who produced a note. It does not establish whether a claim remains true. This layer preserves dated evidence, explicit replacements and review history alongside the existing Markdown vault and Basic Memory index. It does not relocate or delete original notes.

## Read current state

```sh
brain memory recall "What is the current service state?"
brain memory recall "What was the service state then?" --as-of 2026-01-15
brain memory status
brain memory queue --model gpt-6-astra
brain memory health
```

The active vault comes from the existing registry. Use `--vault /absolute/vault/path` when the subject belongs to another vault. `recall` searches that vault's Basic Memory project, then reads source Markdown with lifecycle annotations. Registered superseded excerpts are masked, replacement evidence is attached, and unrelated facts in the same journal remain available. Direct MCP `search_notes` remains a raw search API and does not apply this sidecar; use this command for current-state questions.

`queue --model` requests a review by the named runtime model. A different string is not treated as a better model or proof that the old result is wrong. Records without a completed note review appear as `never-reviewed`. No model call or deletion happens when listing the queue.

## Independent dates and authors

| Field | Meaning |
|---|---|
| `author_model` in Markdown | Original writer; retained after edits. Unknown stays unknown without evidence. |
| `observed_at` | Date of the underlying real-world observation or user decision. |
| `recorded_at` | Time this structured claim was registered, assigned by the tool. |
| `valid_from`, `valid_until` | Half-open applicability interval. A historic query can select an earlier version. |
| `reviewed_at`, `reviewed_by_model` | When and by which model the cited source was reviewed. This is not a new observation. |
| `review_after` | Explicit review deadline, optional. Reaching it prompts review; it does not prove falsity. |
| `evidence_kind` | `source-report`, `direct-observation`, or `user-confirmation`. A source report is not a live test. |

There is deliberately no universal truth score or model ranking. New model releases, elapsed time and source edits can prompt checks. Only an explicit evidence-backed transition replaces a claim. Software state may merit days or weeks between checks, whereas a historical incident may need none. Choose `review_after` for the claim instead of expiring every old note.

## Register or replace a claim

First read the source. Dates and quotations below are illustrative.

```sh
brain memory review-pack _ai/memory/journal/2026-02-01.md
brain memory apply /tmp/review-request.json
```

Example request:

```json
{
  "action": "add-claim",
  "model": "gpt-6-astra",
  "reason": "The dated source explicitly records the changed listener.",
  "claim": {
    "id": "service-port-february",
    "key": "service.port",
    "kind": "fact",
    "state": "accepted",
    "text": "The service listened on port 8000 on February 1.",
    "valid_from": "2026-02-01",
    "observed_at": "2026-02-01",
    "review_after": "2026-03-01",
    "evidence_kind": "source-report",
    "evidence": [{
      "file": "_ai/memory/journal/2026-02-01.md",
      "quote": "On February 1 a live check found the service listening on port 8000."
    }],
    "supersedes": ["service-port-january"]
  }
}
```

An initial claim omits `supersedes`. Keys identify one subject and property; changing a task's implementation status must not replace an unrelated preference. Two accepted versions with overlapping applicability and no explicit supersession are both disputed at retrieval. Proposals must remain `kind: proposal, state: candidate`; a later implementation is a separate fact with its own evidence.

Derived conclusions can declare `depends_on: ["existing-claim-id"]`. A replaced, disputed or invalid source claim then makes the dependent conclusion unavailable as a current fact and sends it to review. Dependencies must already exist in the same vault, preventing forward references and cycles. This applies only to explicitly registered dependencies; the tool does not pretend to infer every connection in legacy prose.

The tool checks unique IDs, dates, topic boundaries, same-vault paths, nonempty exact quotations, body hashes and replacement intervals. It cannot prove that a paraphrase follows logically from its quote, or that the cited source is truthful. The reviewing model must assess those questions; material uncertainty remains explicit.

## Review a note without changing its facts

```json
{
  "action": "review-note",
  "file": "_ai/memory/craft/Example.md",
  "body_sha256": "exact hash returned by review-pack",
  "model": "gpt-6-astra",
  "reason": "Checked source fidelity; current service state was not tested.",
  "outcome": "source-reviewed",
  "review_after": "2026-10-01",
  "evidence": [{"file": "_ai/memory/craft/Example.md", "quote": "A verbatim supporting source excerpt."}]
}
```

This records reading the source, not a live verification, and does not advance any claim's `observed_at`. Source body changes invalidate the bound evidence; metadata-only attribution changes do not. `review-claim` takes `id`, `model`, `reason` and optional `review_after`: it rechecks and binds the existing exact quotes to the current body while preserving the claim text, observed date and acceptance state. Changed conclusions need a new claim. `dispute` and `retract` actions require `id`, `model`, `reason` and evidence; the event log retains the request.

## Storage and automation

`_system/memory-state.json` holds claims, note reviews and the event log. Updates use a per-vault lock and atomic rename. Batch changes must be committed immediately with the vault's normal discipline. Source Markdown and immutable library raw files are not edited by this module. The event log and Git keep the history reviewable.

The inventory includes existing derived memory and library source notes automatically. Unreviewed does not mean false. This release does not claim to have semantically audited every historical statement. Nightly harvest workers keep their restricted `_ai/memory/` scope; their new notes enter the review inventory without being automatically certified.

The existing session-start recall hook now reads both structured JSON and SSE MCP responses and adds lifecycle context. Global instructions and the harvest skill direct current-state questions through `brain memory recall`. `brief` and `lint` surface registered overdue/conflicting claims and index coverage gaps.

`brain daily` runs local embedding maintenance after harvesting, before lint/snapshot. It handles only the registered vault's memory and library projects. Missing note coverage triggers a full embedding rebuild; otherwise Basic Memory performs incremental maintenance. It does not call a summarization model or change source text. Per-project timeout is the shared `CONTRACT.MEMORY_INDEX_TIMEOUT_MS` value. On failure the daily heartbeat records a failed step rather than reporting success.

The default local health check reads the active model from `~/.basic-memory/config.json` and counts file-backed entities in `~/.basic-memory/memory.db` that have chunks for that model. `BRAIN_BM_DB` / `BRAIN_BM_CONFIG` override these paths for another installation. Coverage proves presence of indexed notes, not recall quality or complete semantic understanding of every paragraph.

## Verification and rollback

`npm test` includes synthetic lifecycle regressions for dated history, unsupported replacement, conflicting versions, proposals, hash changes, vault isolation and lossless source preservation. These tests are separate from the OpenViking A/B corpus and are not reported as improved answer accuracy.

For rollback, revert the code/rule commit and the vault's sidecar/documentation commit. Original sources remain available. Removing the sidecar restores raw search behavior; it also removes the temporal protections. The one-time Basic Memory embedding rebuild is a derived index repair, with the pre-rebuild database snapshot kept outside the benchmark corpus.
