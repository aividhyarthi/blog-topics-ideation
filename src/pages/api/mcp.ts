// AppRankr's MCP server — lets a user's own Claude or ChatGPT query their
// Rank Tracker / ASO Inspector data directly, the same way Semrush's MCP
// server works. Authenticated by a personal API key (see
// lib/saas/apikeys.ts), generated on the Account page — not the session
// cookie, since an MCP client is never a browser. Read-only by design: every
// tool here only reads what's already been checked/cached, it never triggers
// a live store search or a paid AI call on someone else's behalf.
//
// Implements the Streamable HTTP transport's simple (non-SSE) mode: one
// JSON-RPC request in, one JSON-RPC response out, no server-side session
// state to keep. That's within spec — a server may answer a POST with a
// single `application/json` response instead of opening an event stream —
// and it's all a stateless serverless-style route can do without pretending
// to be smarter than it is.
import type { APIRoute } from 'astro';
import { userFromApiKey } from '../../lib/saas/apikeys';
import { loadConfig, loadSnapshots, loadAsoCache, loadRatingHistory } from '../../lib/rank/store';
import { keywordTrends } from '../../lib/rank/track';
import type { TrackedApp } from '../../lib/rank/types';

const PROTOCOL_VERSION = '2025-03-26';

const rpc = (id: unknown, result: unknown) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });
const textContent = (data: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(data) }] });

const TOOLS = [
  {
    name: 'list_tracked_apps',
    description: 'List every app this AppRankr account tracks, with its store, country, and keyword counts.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_app_rankings',
    description: 'Current and recent search-rank position for one tracked app\'s keywords, including the daily delta and a short history (oldest to newest). Omit `keywords` for the app\'s full tracked list.',
    inputSchema: {
      type: 'object',
      properties: {
        appKey: { type: 'string', description: 'The app\'s key from list_tracked_apps, e.g. "play:com.example.app".' },
        keywords: { type: 'array', items: { type: 'string' }, description: 'Optional subset of keywords to return; defaults to all of the app\'s tracked keywords.' },
      },
      required: ['appKey'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_aso_score',
    description: 'The most recent cached ASO Inspector audit for one tracked app (listing quality report and AI verdict), if one has been run.',
    inputSchema: {
      type: 'object',
      properties: { appKey: { type: 'string', description: 'The app\'s key from list_tracked_apps.' } },
      required: ['appKey'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_rating_history',
    description: 'Daily star-rating trend for one tracked app: total reviews seen and the 1-2 star share over time.',
    inputSchema: {
      type: 'object',
      properties: {
        appKey: { type: 'string', description: 'The app\'s key from list_tracked_apps.' },
        days: { type: 'number', description: 'How many of the most recent points to return. Defaults to 30.' },
      },
      required: ['appKey'],
      additionalProperties: false,
    },
  },
] as const;

function findApp(apps: TrackedApp[], appKey: string): TrackedApp | undefined {
  return apps.find((a) => a.key === appKey);
}

function callTool(userId: string, name: string, args: Record<string, any>): unknown {
  const cfg = loadConfig(userId);

  if (name === 'list_tracked_apps') {
    return {
      apps: cfg.apps.map((a) => ({
        key: a.key, store: a.store, appId: a.appId, country: a.country,
        title: a.title, developer: a.developer, url: a.url,
        trackedKeywordCount: a.keywords.length,
        coverageKeywordCount: (a.coverageKeywords || []).length,
        competitorOf: a.competitorOf || null,
      })),
    };
  }

  const appKey = String(args.appKey || '');
  const app = findApp(cfg.apps, appKey);
  if (!app) throw new Error(`No tracked app with key "${appKey}". Call list_tracked_apps for valid keys.`);

  if (name === 'get_app_rankings') {
    const keywordList: string[] = Array.isArray(args.keywords) && args.keywords.length
      ? args.keywords.map(String)
      : app.keywords;
    const snapshots = loadSnapshots(30, userId);
    const trends = keywordTrends(app, snapshots, 30, keywordList);
    return {
      appKey, title: app.title,
      keywords: trends.map((t) => ({
        keyword: t.keyword, position: t.position, delta: t.delta, prevPosition: t.prevPosition,
        best: t.best, history: t.history, checked: t.checked,
        topApps: t.top.map((x) => x.title),
      })),
    };
  }

  if (name === 'get_aso_score') {
    const entry = loadAsoCache(userId)[appKey];
    if (!entry) return { appKey, title: app.title, available: false, message: 'No ASO Inspector audit has been run for this app yet.' };
    return { appKey, title: app.title, available: true, checkedAt: entry.checkedAt, focusList: entry.focusList, report: entry.data };
  }

  if (name === 'get_rating_history') {
    const days = Number.isFinite(args.days) ? Math.max(1, Math.min(365, Number(args.days))) : 30;
    const points = loadRatingHistory(userId)[appKey] || [];
    return { appKey, title: app.title, points: points.slice(-days) };
  }

  throw new Error(`Unknown tool "${name}".`);
}

export const POST: APIRoute = async ({ request }) => {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  const user = userFromApiKey(token);

  let body: any;
  try { body = await request.json(); }
  catch {
    return new Response(JSON.stringify(rpcError(null, -32700, 'Parse error.')), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const id = body?.id ?? null;
  const method = String(body?.method || '');

  // Notifications (no `id`) get no response body at all, per JSON-RPC.
  if (id === null && method.startsWith('notifications/')) {
    return new Response(null, { status: 202 });
  }

  if (!user) {
    return new Response(JSON.stringify(rpcError(id, -32001, 'Unauthorized — provide a valid AppRankr API key as a Bearer token.')), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    if (method === 'initialize') {
      return json(rpc(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'apprankr', version: '1.0.0' },
      }));
    }

    if (method === 'tools/list') {
      return json(rpc(id, { tools: TOOLS }));
    }

    if (method === 'tools/call') {
      const toolName = String(body?.params?.name || '');
      const args = body?.params?.arguments || {};
      try {
        const result = callTool(user.id, toolName, args);
        return json(rpc(id, textContent(result)));
      } catch (e) {
        // A bad appKey/tool name is a tool-level error, not a protocol
        // error — surfaced as isError content so the model can see and
        // react to the message, same as any other tool failure.
        return json(rpc(id, { content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true }));
      }
    }

    if (method === 'ping') {
      return json(rpc(id, {}));
    }

    return json(rpcError(id, -32601, `Method "${method}" not found.`));
  } catch (e) {
    return json(rpcError(id, -32603, e instanceof Error ? e.message : String(e)));
  }
};

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

// A GET with an SSE accept header is how a Streamable HTTP client probes
// for a server-initiated stream. This server never pushes unprompted
// messages, so there's nothing to open — responding 405 tells the client to
// stick to plain request/response POSTs, which is all it needs anyway.
export const GET: APIRoute = async () => new Response('Method not allowed. POST a JSON-RPC request.', { status: 405 });
