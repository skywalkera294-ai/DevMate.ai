import type { AnalyzerContext, ChatTurn, LlmProvider } from './types';
import { cosineSimilarity, hashEmbedding } from './llm';
import { isCodeFile, isGeneratedOrConfig, splitLines, extractImports } from './utils';

export interface Chunk {
  id: string;
  path: string;
  content: string;
  startLine: number;
  embedding: number[];
}

export interface ChatCitation {
  path: string;
  line: number;
  snippet: string;
  score: number;
}

export interface ChatAnswer {
  text: string;
  citations: ChatCitation[];
  usedLlm: boolean;
}

export function chunkFiles(files: Array<{ path: string; content: string; language: string }>): Chunk[] {
  const chunks: Chunk[] = [];
  for (const file of files) {
    if (!isCodeFile(file.path) || isGeneratedOrConfig(file.path)) continue;
    const lines = splitLines(file.content);
    const size = 60;
    for (let i = 0; i < lines.length; i += size) {
      const content = lines.slice(i, i + size).join('\n');
      chunks.push({
        id: `${file.path}#${i + 1}`,
        path: file.path,
        content,
        startLine: i + 1,
        embedding: hashEmbedding(file.path + '\n' + content),
      });
    }
  }
  return chunks;
}

function tokenize(text: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const m of text.toLowerCase().matchAll(/[a-z0-9_]+/g)) {
    const t = m[0];
    if (t.length < 2 || STOPWORDS.has(t)) continue;
    map.set(t, (map.get(t) ?? 0) + 1);
  }
  return map;
}

const STOPWORDS = new Set(
  'a,an,the,is,are,was,were,be,been,being,do,does,did,to,of,in,on,at,for,with,from,by,as,and,or,not,no,it,this,that,these,those,how,what,where,when,which,who,why,can,could,would,should,will,shall,may,might,if,then,than,so,such,you,your,our,their,there,here,all,any,each,some,into,out,about,over,under,again,after,before,between,use,used,using,file,files,code,app,application,show,me'.split(','),
);

export function retrieve(query: string, chunks: Chunk[], k = 6): Array<{ chunk: Chunk; score: number }> {
  const q = tokenize(query);
  const qEmb = hashEmbedding(query);
  const scored = chunks.map((chunk) => {
    const c = tokenize(chunk.path + '\n' + chunk.content);
    let overlap = 0;
    for (const [t, n] of q) {
      const cw = c.get(t);
      if (cw) overlap += Math.min(n, cw) * (1 + Math.log1p(cw));
    }
    const sizeNorm = Math.max(1, Math.log2(c.size));
    const embSim = cosineSimilarity(qEmb, chunk.embedding);
    return { chunk, score: overlap / sizeNorm + embSim * 0.4 };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, k).filter((s) => s.score > 0.01);
}

const INTENT_HINTS: Array<{ re: RegExp; intent: string }> = [
  { re: /auth|login|sign.?in|password|token|jwt|session/, intent: 'authentication' },
  { re: /api|endpoint|route|request|rest/, intent: 'api-endpoints' },
  { re: /redis|cache|queue/, intent: 'cache' },
  { re: /database|db|schema|model|postgres|sql/, intent: 'database' },
  { re: /payment|billing|stripe|checkout|subscription/, intent: 'billing' },
  { re: /deploy|docker|kubernetes|render|vercel|aws|azure/, intent: 'deployment' },
  { re: /test|spec|jest|pytest/, intent: 'testing' },
  { re: /error|exception|fail|bug/, intent: 'errors' },
];

function detectIntent(query: string): string {
  for (const h of INTENT_HINTS) {
    if (h.re.test(query)) return h.intent;
  }
  return 'general';
}

export async function answerQuestion(
  query: string,
  ctx: AnalyzerContext,
  llm: LlmProvider,
  history: ChatTurn[] = [],
): Promise<ChatAnswer> {
  const chunks = chunkFiles(ctx.files);
  const top = retrieve(query, chunks, 8);
  const intent = detectIntent(query);

  let citations: ChatCitation[] = top.slice(0, 6).map((r) => ({
    path: r.chunk.path,
    line: r.chunk.startLine,
    snippet: firstLine(r.chunk.content),
    score: r.score,
  }));

  let text = '';
  if (llm.available) {
    const context = top.map((r) => `FILE ${r.chunk.path}:${r.chunk.startLine}\n${r.chunk.content}`).join('\n\n---\n\n');
    try {
      text = await llm.complete(
        'You are DevMate AI, an assistant that answers questions about a developer\'s codebase. ' +
          'Answer precisely using ONLY the provided code context. Reference files by path. If the context does not answer the question, say so and suggest where to look.',
        `Question: ${query}\n\nRelevant code:\n${context}`,
        history,
      );
      return { text, citations, usedLlm: true };
    } catch {
      // fall through to offline answer
    }
  }

  text = composeOfflineAnswer(query, intent, top, ctx);
  return { text, citations, usedLlm: false };
}

function composeOfflineAnswer(query: string, intent: string, top: Array<{ chunk: Chunk; score: number }>, ctx: AnalyzerContext): string {
  if (top.length === 0) {
    return 'I could not find anything relevant in the indexed files. Try a more specific question, or add more source files to the project.';
  }

  const parts: string[] = [];
  const uniquePaths = [...new Set(top.map((r) => r.chunk.path))];

  if (intent === 'api-endpoints') {
    const endpoints: string[] = [];
    const seen = new Set<string>();
    for (const r of top) {
      for (const m of r.chunk.content.matchAll(/@(Get|Post|Put|Patch|Delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi)) {
        const key = `${m[1]!.toUpperCase()} ${m[2]}`;
        if (!seen.has(key)) {
          seen.add(key);
          endpoints.push(`- **${m[1].toUpperCase()} \`${m[2]}\`** — ${r.chunk.path}:${r.chunk.startLine}`);
        }
      }
    }
    if (endpoints.length) {
      parts.push('Here are the API endpoints I found in the most relevant files:');
      parts.push('');
      parts.push(endpoints.slice(0, 15).join('\n'));
    }
  } else if (intent === 'cache') {
    parts.push('Files that reference Redis/caching:');
    parts.push('');
    parts.push(uniquePaths.map((p) => `- \`${p}\``).join('\n'));
  } else if (intent === 'database') {
    parts.push('Database-related code lives in these locations:');
    parts.push('');
    parts.push(uniquePaths.map((p) => `- \`${p}\``).join('\n'));
  }

  parts.push(`I searched the repository and the most relevant code is in ${uniquePaths.length > 1 ? 'these files' : 'this file'}:`);
  parts.push('');
  for (const p of uniquePaths.slice(0, 8)) {
    const r = top.find((t) => t.chunk.path === p);
    parts.push(`- \`${p}\`${r ? `:${r.chunk.startLine}` : ''} — ${firstLine(r!.chunk.content)}`);
  }
  parts.push('');
  parts.push(`> Question: "${query}"`);
  parts.push('> This answer was assembled from local code search. Connect an LLM provider for richer explanations.');
  return parts.join('\n');
}

function firstLine(content: string): string {
  const line = content.split('\n').find((l) => l.trim()) ?? '';
  const t = line.trim();
  return t.length > 100 ? t.slice(0, 100) + '…' : t;
}
