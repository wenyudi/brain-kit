'use strict';
// Model attribution is evidence, not a guess from the configured alias or source session.
const { fs, path, matter, listMdIn, stamp } = require('./lib');

const cleanModels = values => [...new Set((values || []).filter(v => typeof v === 'string' && v.trim() && !v.startsWith('<') && v !== 'unknown'))];
const label = models => models.length === 1 ? models[0] : models.length ? 'multiple' : 'unknown';
function needsAttribution(file, root, data = {}) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  return !['README.md', 'CLAUDE.md', 'AGENTS.md'].includes(path.basename(file)) &&
    (rel.startsWith('_ai/memory/') || (rel.startsWith('_ai/library/sources/') && data.depth !== 'stub'));
}

// Add/replace selected top-level YAML properties without reserializing existing fields or body.
function patchMetadata(text, fields) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  let yaml = match ? match[1] + '\n' : '';
  for (const key of Object.keys(fields)) {
    yaml = yaml.replace(new RegExp('^' + key + ':[^\\n]*(?:\\n(?![A-Za-z_][\\w-]*:)[^\\n]*)*', 'm'), '').replace(/^\n+/, '');
  }
  const added = matter.stringify('', fields).replace(/^---\n/, '').replace(/\n---\n[\s\S]*$/, '');
  return '---\n' + yaml.trimEnd() + (yaml.trim() ? '\n' : '') + added + '\n---\n' + (match ? text.slice(match[0].length) : text);
}

function resultInfo(stdout) {
  try {
    const result = JSON.parse(stdout);
    if (!result || result.type !== 'result') throw new Error('not a result');
    return { valid: true, failed: result.is_error === true, text: result.result || '', models: cleanModels(Object.keys(result.modelUsage || {})), session: result.session_id || null };
  } catch { return { valid: false, failed: true, text: '', models: [], session: null }; }
}

function snapshot(memDir) {
  return new Map(listMdIn(memDir).filter(f => !['README.md', 'CLAUDE.md', 'AGENTS.md'].includes(path.basename(f))).map(f => [f, fs.readFileSync(f, 'utf8')]));
}

function reportedFiles(result, root) {
  return [...new Set(result.split('\n').filter(l => l.trimStart().startsWith('↳')).map(l => {
    const raw = l.trim().slice(1).trim().replace(/^`|`$/g, '');
    const abs = path.resolve(root, raw);
    const memDir = fs.realpathSync(path.join(root, '_ai', 'memory'));
    try { const real = fs.realpathSync(abs); return real.startsWith(memDir + path.sep) && real.endsWith('.md') ? real : null; } catch { return null; }
  }).filter(Boolean))];
}

function stampRun(root, before, info, run) {
  const written = [];
  for (const file of reportedFiles(info.text, root)) {
    const text = fs.readFileSync(file, 'utf8');
    if (before.get(file) === text) continue;
    const previous = before.get(file);
    const old = previous === undefined ? {} : matter(previous).data;
    const data = matter(text).data;
    const models = cleanModels(info.models);
    // Existing author evidence always survives a later edit, even if the writer replaced frontmatter.
    const fields = {
      author_model: previous === undefined ? label(models) : (old.author_model || 'unknown'),
      author_model_evidence: previous === undefined ? (models.length ? 'claude-result.modelUsage' : 'unavailable') : (old.author_model_evidence || 'original-writer-not-recorded'),
      contributor_models: cleanModels([...(old.contributor_models || []), ...models]),
      last_updated_by_model: label(models),
      source_models: cleanModels([...(old.source_models || []), ...(data.source_models || []), ...(run.source_models || [])]),
      model_provenance: [...(old.model_provenance || []), { at: stamp(), role: previous === undefined ? 'create' : 'update', models: models.length ? models : ['unknown'], requested_model: run.requested_model, evidence: 'claude-result.modelUsage', writer_session: info.session || 'unavailable', source_session: run.source_session }],
    };
    fs.writeFileSync(file, patchMetadata(text, fields));
    written.push(file);
  }
  return written;
}

module.exports = { cleanModels, label, needsAttribution, patchMetadata, resultInfo, snapshot, reportedFiles, stampRun };
