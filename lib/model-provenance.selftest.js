'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path'); const assert = require('assert/strict');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-model-test-'));
process.env.BRAIN_ROOT = root;
const M = require('./model-provenance'); const matter = require('gray-matter');
try {
  const dir = path.join(root, '_ai/memory/journal'); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, '2026-09-14.md');
  const original = '---\ntitle: 中文\ntags:\n- test\ncreated: 2026-09-14\n---\n\nBody keeps its exact whitespace.\n';
  const patched = M.patchMetadata(original, { author_model: 'gpt-6-astra', model_provenance: [{ role: 'create', models: ['gpt-6-astra'] }] });
  assert.equal(matter(patched).content, matter(original).content);
  assert.deepEqual(matter(patched).data.tags, ['test']);
  const twice = M.patchMetadata(patched, { author_model: 'unknown' });
  assert.equal(matter(twice).data.author_model, 'unknown');
  assert.equal(matter(twice).data.model_provenance[0].models[0], 'gpt-6-astra');
  assert.equal((twice.match(/^author_model:/gm) || []).length, 1);
  assert.equal(M.resultInfo('bad json').valid, false);
  assert.equal(M.resultInfo('{"type":"result","is_error":true}').failed, true);
  assert.deepEqual(M.resultInfo('{"type":"result","result":"ok"}').models, []);
  let before = M.snapshot(path.join(root, '_ai/memory'));
  fs.writeFileSync(file, original);
  let info = M.resultInfo(JSON.stringify({ type: 'result', is_error: false, result: '↳ _ai/memory/journal/2026-09-14.md', modelUsage: { 'claude-sonnet-test': {} }, session_id: 'writer-1' }));
  const run = { requested_model: 'sonnet', source_session: '/source/codex.jsonl', source_models: ['gpt-6-astra'] };
  assert.equal(M.stampRun(root, before, info, run).length, 1);
  let data = matter(fs.readFileSync(file, 'utf8')).data;
  assert.equal(data.author_model, 'claude-sonnet-test');
  assert.deepEqual(data.source_models, ['gpt-6-astra']);
  before = M.snapshot(path.join(root, '_ai/memory'));
  assert.equal(M.stampRun(root, before, info, run).length, 0);
  fs.writeFileSync(file, original + '\nA later entry.\n'); // Later writer accidentally dropped old metadata.
  info.models = ['gpt-6-astra'];
  assert.equal(M.stampRun(root, before, info, run).length, 1);
  data = matter(fs.readFileSync(file, 'utf8')).data;
  assert.equal(data.author_model, 'claude-sonnet-test');
  assert.equal(data.last_updated_by_model, 'gpt-6-astra');
  assert.equal(data.model_provenance.length, 2);
  assert.deepEqual(data.contributor_models, ['claude-sonnet-test', 'gpt-6-astra']);
  assert.equal(M.reportedFiles('↳ ../../outside.md', root).length, 0);
  assert.equal(M.reportedFiles('↳ _ai/memory/journal/2026-09-14.md extra prose', root).length, 0);
  const other = path.join(dir, 'other.md'); fs.writeFileSync(other, original);
  M.stampRun(root, before, info, run);
  assert.equal(fs.readFileSync(other, 'utf8'), original); // Unreported concurrent write is untouched.
  assert.equal(M.label(M.resultInfo('{"type":"result"}').models), 'unknown');
  assert.equal(M.needsAttribution(file, root), true);
  assert.equal(M.needsAttribution(path.join(root, '_ai/library/raw/article.md'), root), false);
  assert.equal(M.needsAttribution(path.join(root, '_ai/library/sources/article.md'), root, { depth: 'stub' }), false);
  const { spawnSync } = require('child_process');
  fs.writeFileSync(other, original);
  // 2026-10-25 起 check.js 不再要求 author_model（来源字段随规矩取消），缺字段的记忆笔记照样放行
  assert.equal(spawnSync(process.execPath, [path.join(__dirname, 'check.js'), other], { env: process.env }).status, 0);
  fs.writeFileSync(other, M.patchMetadata(original, { author_model: 'unknown', author_model_evidence: 'unavailable' }));
  assert.equal(spawnSync(process.execPath, [path.join(__dirname, 'check.js'), other], { env: process.env }).status, 0);
  console.log('model provenance: YAML/body preservation, model switching, attribution separation, repeated edits, result errors, path scope passed');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
