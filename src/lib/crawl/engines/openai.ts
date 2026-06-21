// OpenAI engine — live web-grounded answers via the Responses API, so we get
// both brand mentions (in the text) and real citations (url_citation
// annotations). Defensive: tries the GA web_search tool, then the preview name,
// then falls back to no-tool (parametric answer, mentions only) so we ALWAYS
// return a usable answer even if web search isn't enabled on the account.

import { mapPool, tasksFor } from '../pool';
import type { Citation, PromptSet, RawResponse } from '../types';

const OPENAI_URL = 'https://api.openai.com/v1/responses';
const MODEL = (import.meta as any).env?.OPENAI_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-4o';

export function openaiKey(): string | undefined {
  return (import.meta as any).env?.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
}

function parseResponses(data: any): { text: string; citations: Citation[] } {
  let text = '';
  const citations: Citation[] = [];
  for (const item of data?.output ?? []) {
    if (item?.type === 'message' && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (c?.type === 'output_text') {
          text += c.text || '';
          for (const ann of c.annotations ?? []) {
            if (ann?.type === 'url_citation' && ann.url) citations.push({ url: ann.url, title: ann.title });
          }
        }
      }
    }
  }
  if (!text && typeof data?.output_text === 'string') text = data.output_text;
  return { text, citations };
}

async function call(key: string, body: unknown): Promise<Response> {
  return fetch(OPENAI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
}

async function queryOpenAI(prompt: string, locale: string, key: string): Promise<{ text: string; citations: Citation[] }> {
  const input = `${prompt} — answer for a shopper in ${locale}. Recommend specific brands and products by name.`;
  const attempts: any[] = [
    { model: MODEL, tools: [{ type: 'web_search' }], input },
    { model: MODEL, tools: [{ type: 'web_search_preview' }], input },
    { model: MODEL, input }, // no tool: still yields brand mentions (no citations)
  ];
  let lastErr = '';
  for (const body of attempts) {
    const res = await call(key, body);
    if (res.ok) return parseResponses(await res.json());
    lastErr = `OpenAI ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`;
    // Only fall through to the next attempt for tool/param errors (400/404).
    if (res.status !== 400 && res.status !== 404) break;
  }
  throw new Error(lastErr || 'OpenAI request failed');
}

export async function collectOpenAI(set: PromptSet): Promise<RawResponse[]> {
  const key = openaiKey()!;
  const tasks = tasksFor(set.topics, set.runsPerPrompt);
  return mapPool(tasks, 4, async (t) => {
    let out: { text: string; citations: Citation[] };
    try { out = await queryOpenAI(t.prompt, set.locale, key); }
    catch (e) { out = { text: `__error__ ${String((e as Error).message)}`, citations: [] }; }
    return {
      topic: t.topic, prompt: t.prompt, engine: 'openai' as const, run: t.run,
      text: out.text, citations: out.citations, ts: new Date().toISOString(),
    };
  });
}
