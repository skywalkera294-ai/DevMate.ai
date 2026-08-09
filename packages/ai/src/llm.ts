import type { ChatTurn, LlmProvider } from './types';

function trimEndpoint(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Hard cap on prompt context so small models don't overflow. */
const MAX_CONTEXT_CHARS = 60_000;

function clampContext(text: string): string {
  if (text.length <= MAX_CONTEXT_CHARS) return text;
  return text.slice(0, MAX_CONTEXT_CHARS) + '\n\n…[context truncated]';
}

function simpleHash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function localEmbedding(text: string, dims = 256): number[] {
  const vec = new Array<number>(dims).fill(0);
  const tokens = text.toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean);
  for (const tok of tokens) {
    const h = simpleHash(tok);
    const idx = h % dims;
    const sign = h & 1 ? 1 : -1;
    vec[idx] += sign * (1 + (h % 5));
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export class OfflineLlmProvider implements LlmProvider {
  readonly available = false;
  async complete(): Promise<string> {
    throw new Error('Offline provider cannot complete prompts. Use openai-compatible provider.');
  }
  async embed(text: string): Promise<number[]> {
    return localEmbedding(text);
  }
}

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly available: boolean;
  constructor(
    private readonly opts: {
      model: string;
      apiKey: string;
      baseUrl?: string;
      embeddingModel?: string;
    },
  ) {
    this.available = Boolean(opts.apiKey);
  }

  private endpoint(path: string): string {
    return `${trimEndpoint(this.opts.baseUrl || 'https://api.openai.com/v1')}/${path}`;
  }

  async complete(system: string, user: string, history: ChatTurn[] = []): Promise<string> {
    const res = await fetch(this.endpoint('chat/completions'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.opts.apiKey}`,
      },
      body: JSON.stringify({
        model: this.opts.model,
        messages: [
          { role: 'system', content: clampContext(system) },
          ...history.slice(-12).map((m) => ({ role: m.role, content: clampContext(m.content) })),
          { role: 'user', content: clampContext(user) },
        ],
        temperature: 0.2,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`LLM request failed (${res.status}): ${body.slice(0, 500)}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? '';
  }

  async embed(text: string): Promise<number[]> {
    const model = this.opts.embeddingModel || 'text-embedding-3-small';
    try {
      const res = await fetch(this.endpoint('embeddings'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.opts.apiKey}`,
        },
        body: JSON.stringify({ model, input: text.slice(0, 8000) }),
      });
      if (!res.ok) return localEmbedding(text);
      const data = (await res.json()) as {
        data?: Array<{ embedding?: number[] }>;
      };
      return data.data?.[0]?.embedding ?? localEmbedding(text);
    } catch {
      return localEmbedding(text);
    }
  }
}

export function createLlmProvider(opts: {
  provider?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  embeddingModel?: string;
}): LlmProvider {
  if (opts.provider === 'openai-compatible' && opts.apiKey) {
    return new OpenAiCompatibleProvider({
      model: opts.model || 'gpt-4o-mini',
      apiKey: opts.apiKey,
      baseUrl: opts.baseUrl,
      embeddingModel: opts.embeddingModel,
    });
  }
  return new OfflineLlmProvider();
}

/** Deterministic local embeddings used when no remote embedding API is available. */
export function hashEmbedding(text: string, dims = 256): number[] {
  return localEmbedding(text, dims);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
