// Anthropic (Claude) engine — live answers via the Messages API with the
// web_search server tool, so we get mentions + citations. Falls back to a plain
// (parametric) message if web search isn't available, so it always returns text.

import { mapPool, tasksFor } from '../pool';
import type { Citation, PromptSet, RawResponse } from '../types';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = (import.meta as any).env?.ANTHROPIC_MODEL ?? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';

export function anthropicKey(): string | undefined {
  return (import.meta as any).env?.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
}

function parseMessages(data: any): { text: string; citations: Citation[] } {
  let text = '';
  const citations: Citation[] = [];
  for (const block of data?.content ?? []) {
    if (block?.type === 'text') {
      text += block.text || '';
      for (const c of block.citations ?? []) if (c?.url) citations.push({ url: c.url, title: c.title });
    } else if (block?.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const r of block.content) if (r?.url) citations.push({ url: r.url, title: r.title });
    }
  }
  return { text, citations };
}

async function call(key: string, body: unknown): Promise<Response> {
  return fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
}

async function queryAnthropic(prompt: string, locale: string, key: string): Promise<{ text: string; citations: Citation[] }> {
  const content = `${prompt} — answer for a shopper in ${locale}. Recommend specific brands and products by name.`;
  const base = { model: MODEL, max_tokens: 1024, messages: [{ role: 'user', content }] };
  const attempts: any[] = [
    { ...base, tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }] },
    base, // no tool: parametric answer (mentions, no citations)
  ];
  let lastErr = '';
  for (const body of attempts) {
    const res = await call(key, body);
    if (res.ok) return parseMessages(await res.json());
    lastErr = `Anthropic ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`;
    if (res.status !== 400 && res.status !== 404) break;
  }
  throw new Error(lastErr || 'Anthropic request failed');
}

export async function collectAnthropic(set: PromptSet): Promise<RawResponse[]> {
  const key = anthropicKey()!;
  const tasks = tasksFor(set.topics, set.runsPerPrompt);
  return mapPool(tasks, 4, async (t) => {
    let out: { text: string; citations: Citation[] };
    try { out = await queryAnthropic(t.prompt, set.locale, key); }
    catch (e) { out = { text: `__error__ ${String((e as Error).message)}`, citations: [] }; }
    return {
      topic: t.topic, prompt: t.prompt, engine: 'anthropic' as const, run: t.run,
      text: out.text, citations: out.citations, ts: new Date().toISOString(),
    };
  });
}
