import type { AnalyzerContext, ScanResult, Section } from './types';
import { splitLines, isCodeFile, isTestFile, extractImports } from './utils';

export interface GraphNode {
  id: string;
  label: string;
  path?: string;
  kind: 'file' | 'dir' | 'db' | 'api';
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: 'import' | 'contains' | 'fk';
}

export interface ArchitectureData {
  tree: string;
  mermaid: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  apiFlows: Array<{ endpoint: string; file: string }>;
  dbRelations: Array<{ from: string; to: string; on: string }>;
  components: Array<{ name: string; detail: string }>;
}

export function generateArchitecture(ctx: AnalyzerContext): ScanResult {
  const files = ctx.files.filter((f) => isCodeFile(f.path) && !isTestFile(f.path));
  const data = buildArchitectureData(ctx, files);

  const sections: Section[] = [
    { title: 'Folder Tree', content: '```text\n' + data.tree + '\n```' },
    { title: 'Dependency Graph', content: data.mermaid },
    {
      title: 'API Flow',
      content: data.apiFlows.length
        ? data.apiFlows.map((a) => `- \`${a.endpoint}\` → \`${a.file}\``).join('\n')
        : '_No routes detected._',
    },
    {
      title: 'Database Relationships',
      content: data.dbRelations.length
        ? data.dbRelations.map((r) => `- \`${r.from}\` ⟶ \`${r.to}\` (on ${r.on})`).join('\n')
        : '_No relational schema detected._',
    },
    {
      title: 'Component Overview',
      content: data.components.map((c) => `- **${c.name}** — ${c.detail}`).join('\n'),
    },
  ];

  return {
    summary: `Mapped ${data.nodes.length} nodes and ${data.edges.length} relationships across the codebase.`,
    sections,
    markdown: sections.map((s) => `## ${s.title}\n\n${s.content}\n`).join('\n'),
    data: data as unknown as Record<string, unknown>,
  };
}

function buildArchitectureData(ctx: AnalyzerContext, files: Array<{ path: string; content: string; language: string }>): ArchitectureData {
  const tree = folderTree(files.map((f) => f.path));
  const nodeMap = new Map<string, GraphNode>();
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const apiFlows: ArchitectureData['apiFlows'] = [];

  for (const file of files) {
    const id = `f_${file.path.replace(/[^a-zA-Z0-9]/g, '_')}`;
    nodeMap.set(file.path, { id, label: file.path, path: file.path, kind: 'file' });
    nodes.push(nodeMap.get(file.path)!);
  }

  for (const file of files) {
    const src = nodeMap.get(file.path)!;
    for (const imp of extractImports(file.content, file.language)) {
      const target = resolve(file.path, imp, nodeMap);
      if (target && target !== file.path) {
        edges.push({ from: src.id, to: nodeMap.get(target)!.id, kind: 'import' });
      }
    }
  }

  // API flows
  for (const file of files) {
    const lines = splitLines(file.content);
    for (const line of lines) {
      const m = line.match(/@(?:Get|Post|Put|Patch|Delete)\s*\(\s*['"]([^'"]+)['"]/i) || line.match(/\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/i);
      if (m) apiFlows.push({ endpoint: m[2] ?? m[1], file: file.path });
    }
  }

  // DB relationships from Prisma schema
  const dbRelations: ArchitectureData['dbRelations'] = [];
  const schema = ctx.files.find((f) => f.path.toLowerCase().endsWith('schema.prisma'));
  if (schema) {
    for (const m of schema.content.matchAll(/^\s*(\w+)\s+(\w+)\s+@relation\(/gm)) {
      dbRelations.push({ from: m[1], to: m[2], on: m[1] });
    }
  }

  const languageCount = new Map<string, number>();
  for (const f of files) {
    languageCount.set(f.language, (languageCount.get(f.language) ?? 0) + 1);
  }

  const components: ArchitectureData['components'] = [
    { name: 'Frontend', detail: 'React/Next.js application layer' },
    { name: 'API', detail: 'Backend service layer' },
    { name: 'Database', detail: 'Persistent storage layer' },
    { name: 'AI Engine', detail: 'Analysis and generation pipeline (DevMate AI)' },
  ];
  for (const [lang, count] of languageCount) {
    components.push({ name: `${lang} modules`, detail: `${count} file(s)` });
  }

  return { tree, mermaid: toMermaid(nodes, edges), nodes, edges, apiFlows, dbRelations, components };
}

function toMermaid(nodes: GraphNode[], edges: GraphEdge[]): string {
  const lines = ['```mermaid', 'graph LR'];
  for (const n of nodes.slice(0, 120)) {
    lines.push(`  ${n.id}["${n.label.split('/').pop()}"]`);
  }
  for (const e of edges.slice(0, 80)) {
    lines.push(`  ${e.from} --> ${e.to}`);
  }
  lines.push('```');
  return lines.join('\n');
}

function resolve(from: string, imp: string, nodeMap: Map<string, GraphNode>): string | null {
  if (!imp.startsWith('.')) return null;
  const base = from.split('/').slice(0, -1).join('/');
  const resolved = joinPath(base, imp);
  const candidates = [resolved, resolved + '.ts', resolved + '.tsx', resolved + '.js', resolved + '.jsx', resolved + '/index.ts', resolved + '/index.js', resolved + '.py', resolved + '.go'];
  for (const c of candidates) if (nodeMap.has(c)) return c;
  for (const c of candidates) for (const key of nodeMap.keys()) if (key.endsWith(c)) return key;
  return null;
}

function joinPath(base: string, rel: string): string {
  const parts = base ? base.split('/') : [];
  for (const part of rel.split('/')) {
    if (part === '.' || !part) continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

function folderTree(paths: string[]): string {
  const root: Record<string, any> = {};
  for (const p of paths) {
    const parts = p.split('/');
    let node = root;
    for (const part of parts) {
      node = node[part] ??= {};
    }
  }
  const render = (node: Record<string, any>, prefix: string, out: string[]): void => {
    const keys = Object.keys(node);
    keys.forEach((k, i) => {
      const last = i === keys.length - 1;
      const children = Object.keys(node[k]).length > 0;
      out.push(`${prefix}${last ? '└── ' : '├── '}${k}${children ? '/' : ''}`);
      if (children) render(node[k], prefix + (last ? '    ' : '│   '), out);
    });
  };
  const out: string[] = [];
  if (Object.keys(root).length === 1) {
    const single = Object.keys(root)[0];
    out.push(single + '/');
    render(root[single], '', out);
    return out.join('\n');
  }
  for (const k of Object.keys(root)) out.push(k + (Object.keys(root[k]).length ? '/' : ''));
  return out.join('\n');
}
