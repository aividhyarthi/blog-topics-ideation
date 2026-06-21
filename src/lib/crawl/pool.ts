// Bounded-concurrency map — run async fn over items N at a time, preserving
// order. Keeps live multi-prompt/multi-run crawls from being painfully slow
// (sequential) or hammering the API (unbounded).
export async function mapPool<T, R>(
  items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  const workers = Array.from({ length: n }, async () => {
    while (true) {
      const idx = next++;
      if (idx >= items.length) break;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

// Flatten a prompt set into the (topic, prompt, run) tasks every live engine
// needs to execute.
export function tasksFor(topics: { topic: string; prompts: string[] }[], runs: number) {
  const tasks: { topic: string; prompt: string; run: number }[] = [];
  for (const t of topics) for (const prompt of t.prompts) for (let run = 1; run <= runs; run++) {
    tasks.push({ topic: t.topic, prompt, run });
  }
  return tasks;
}
