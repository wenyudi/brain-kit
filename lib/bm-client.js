'use strict';
// A small read-only client shared by interactive recall and the session-start hook.
const BM = process.env.BRAIN_BM_URL || 'http://127.0.0.1:8000/mcp';
function parseResponse(text) {
  if (!text.trim()) return null;
  if (text.trimStart().startsWith('{')) return JSON.parse(text);
  const blocks = text.replace(/\r\n/g, '\n').split('\n\n');
  const payloads = blocks.map(b => b.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n')).filter(Boolean);
  return payloads.length ? JSON.parse(payloads[payloads.length - 1]) : null;
}
async function search(query, project, { timeout = 15000, limit = 20 } = {}) {
  let sid;
  async function post(body, method = 'POST') {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), timeout);
    try {
      const res = await fetch(BM, { method, signal: ac.signal, headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(sid ? { 'mcp-session-id': sid } : {}) }, body: method === 'POST' ? JSON.stringify(body) : undefined });
      if (!res.ok) throw new Error(`Basic Memory HTTP ${res.status}`);
      sid = res.headers.get('mcp-session-id') || sid;
      return parseResponse(await res.text());
    } finally { clearTimeout(t); }
  }
  try {
    await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'brain-memory', version: '1' } } });
    await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
    const reply = await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'search_notes', arguments: { query, project, page_size: limit, output_format: 'json' } } });
    if (reply?.error || reply?.result?.isError) throw new Error('Basic Memory search failed');
    const result = reply?.result?.structuredContent?.result || JSON.parse(reply.result.content.find(c => c.type === 'text').text);
    if (!Array.isArray(result.results)) throw new Error('Unexpected Basic Memory result format');
    return result.results;
  } finally { if (sid) try { await post(null, 'DELETE'); } catch { /* Best-effort session cleanup. */ } }
}
module.exports = { parseResponse, search };
