import type { AnalyzerFile } from './types';
import type { Severity } from '@devmate/shared';

export function splitLines(content: string): string[] {
  return content.replace(/\r\n/g, '\n').split('\n');
}

export function countLines(content: string): number {
  if (!content.trim()) return 0;
  return content.replace(/\r\n/g, '\n').split('\n').length;
}

export function countCodeLines(content: string, language: string): number {
  return splitLines(content).filter((l) => {
    const t = l.trim();
    if (!t) return false;
    if (language === 'python' && t.startsWith('#')) return false;
    if (t.startsWith('//')) return false;
    if (t.startsWith('/*') || t.startsWith('*') || t.startsWith('*/')) return false;
    return true;
  }).length;
}

/** Strip string literals so keyword matching does not fire inside strings. */
export function stripStrings(content: string): string {
  return content.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, ' ');
}

/** Strip comments for pattern detection (keeps line numbers intact). */
export function stripComments(content: string, language: string): string {
  if (language === 'python') {
    return content.replace(/^\s*#[^\n]*$/gm, (m) => m.replace(/[^\n]/g, ' '));
  }
  return content
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m) => m.replace(/\/\/[^\n]*/, (mm) => mm.replace(/[^\n]/g, ' ')));
}

export interface LineMatch {
  line: number;
  text: string;
  match?: string;
}

export function findMatches(content: string, regex: RegExp, flags: string[] = ['g', 'i']): LineMatch[] {
  const lines = splitLines(content);
  const re = new RegExp(regex.source, flags.join(''));
  const out: LineMatch[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (m) {
      out.push({ line: i + 1, text: lines[i].trim(), match: m[0] });
    }
  }
  return out;
}

export function indentationOf(line: string): number {
  return line.search(/\S/);
}

export function extractImports(content: string, language: string): string[] {
  const imports: string[] = [];
  if (language === 'python') {
    for (const m of content.matchAll(/^\s*(?:import|from)\s+([\w.]+)/gm)) imports.push(m[1]);
  } else if (['javascript', 'typescript'].includes(language)) {
    for (const m of content.matchAll(/(?:import|require)\s*\(?\s*['"]([^'"]+)['"]/g)) imports.push(m[1]);
    for (const m of content.matchAll(/from\s+['"]([^'"]+)['"]/g)) imports.push(m[1]);
  } else if (language === 'go') {
    for (const m of content.matchAll(/^\s*"([^"]+)"/gm)) imports.push(m[1]);
  } else if (language === 'rust') {
    for (const m of content.matchAll(/^\s*(?:use|extern crate)\s+([\w:]+)/gm)) imports.push(m[1]);
  } else if (language === 'php') {
    for (const m of content.matchAll(/^\s*use\s+([\w\\]+)/gm)) imports.push(m[1]);
  }
  return imports;
}

export function isTestFile(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.includes('.test.') ||
    lower.includes('.spec.') ||
    lower.includes('/test/') ||
    lower.includes('/tests/') ||
    lower.includes('__tests__') ||
    lower.endsWith('_test.go')
  );
}

export function isGeneratedOrConfig(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.endsWith('.lock') ||
    lower.endsWith('.min.js') ||
    lower.endsWith('.min.css') ||
    lower.endsWith('package-lock.json') ||
    lower.endsWith('pnpm-lock.yaml') ||
    lower.endsWith('yarn.lock') ||
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.svg') ||
    lower.endsWith('.ico') ||
    lower.endsWith('.woff') ||
    lower.endsWith('.woff2') ||
    lower.endsWith('.ttf') ||
    lower.endsWith('.eot')
  );
}

export function readableSeverity(severity: Severity): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

export function estimateComplexity(code: string): number {
  let score = 0;
  score += (code.match(/\b(if|else if|for|while|do|case|catch|switch)\b/g) || []).length;
  score += (code.match(/&&|\|\||\?\./g) || []).length;
  score += (code.match(/\(/g) || []).length * 0.05;
  return Math.round(score);
}

let idCounter = 0;
export function findingId(): string {
  idCounter += 1;
  return `f-${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function languageLabel(language: string): string {
  const map: Record<string, string> = {
    python: 'Python',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    java: 'Java',
    c: 'C',
    cpp: 'C++',
    csharp: 'C#',
    go: 'Go',
    rust: 'Rust',
    php: 'PHP',
    kotlin: 'Kotlin',
    swift: 'Swift',
    other: 'Other',
  };
  return map[language] ?? 'Other';
}

export function isCodeFile(path: string): boolean {
  return !isGeneratedOrConfig(path) && languageFromExt(path) !== 'other';
}

export function languageFromExt(path: string): string {
  const name = path.split('/').pop() ?? path;
  if (name.toLowerCase() === 'dockerfile') return 'dockerfile';
  const dot = name.lastIndexOf('.');
  if (dot < 0) return 'other';
  const ext = name.slice(dot + 1).toLowerCase();
  const map: Record<string, string> = {
    py: 'python',
    java: 'java',
    js: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    hpp: 'cpp',
    cc: 'cpp',
    cs: 'csharp',
    go: 'go',
    rs: 'rust',
    php: 'php',
    kt: 'kotlin',
    kts: 'kotlin',
    swift: 'swift',
  };
  return map[ext] ?? 'other';
}

export function isCodeLanguage(language: string): boolean {
  return language !== 'other' && language !== 'dockerfile' && language !== 'markdown';
}

export interface ParsedFunction {
  name: string;
  params: string[];
  returns: string | null;
  line: number;
  body: string;
  raw: string;
  isClass: boolean;
  className?: string;
  doc?: string;
}

const FUNC_PATTERNS: Array<{ lang: string; re: RegExp; isClass: boolean }> = [
  {
    lang: 'python',
    re: /^(\s*)(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*([^:]+))?:/gm,
    isClass: false,
  },
  {
    lang: 'javascript',
    re: /^(\s*)(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/gm,
    isClass: false,
  },
  {
    lang: 'typescript',
    re: /^(\s*)(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^={\n]+))?/gm,
    isClass: false,
  },
];

const CLASS_PATTERNS: Array<{ lang: string; re: RegExp; isClass: boolean }> = [
  { lang: 'python', re: /^(\s*)class\s+(\w+)(?:\(([^)]*)\))?:/gm, isClass: true },
  { lang: 'typescript', re: /^(\s*)(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:<[^>]*>)?(?:\s+extends\s+\w+)?(?:\s+implements\s+[\w\s,]+)?\s*\{/gm, isClass: true },
  { lang: 'javascript', re: /^(\s*)(?:export\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?\s*\{/gm, isClass: true },
];

export function parseFunctions(content: string, language: string): ParsedFunction[] {
  const lines = splitLines(content);
  const out: ParsedFunction[] = [];
  const patterns = [...FUNC_PATTERNS, ...CLASS_PATTERNS].filter((p) => p.lang === language);

  for (const p of patterns) {
    for (const m of content.matchAll(p.re)) {
      const indent = (m[1] ?? '').length;
      const name = m[2];
      const paramsRaw = (m[3] ?? '').trim();
      const params = paramsRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.split(':')[0].split('=')[0].replace(/\s/g, ''));
      const returns = m[4] ? m[4].replace(/\s+/g, ' ').trim() : null;

      const startLine = content.slice(0, m.index).split('\n').length;
      let body = '';
      let line = startLine;
      for (let i = startLine; i < lines.length; i++) {
        const l = lines[i];
        if (i === startLine) continue;
        if (l.trim() === '') continue;
        const lind = indentationOf(l);
        if (p.isClass) {
          if (lind <= indent && /^\s*class\s+/.test(l)) break;
          if (lind <= indent && !l.trim().startsWith('@') && !l.trim().startsWith('#')) break;
          body += l + '\n';
          line = i + 1;
        } else {
          if (lind <= indent && !l.trim().startsWith('@')) break;
          body += l + '\n';
          line = i + 1;
        }
      }

      const docMatch = content.slice(0, m.index).match(/(?:#[^\n]*|\/\*\*[\s\S]*?\*\/|\/\/\/[^\n]*)\s*$/);
      const doc = docMatch ? docMatch[0] : undefined;

      out.push({
        name,
        params,
        returns,
        line: startLine,
        body,
        raw: m[0],
        isClass: p.isClass,
        className: p.isClass ? name : undefined,
        doc,
      });
    }
  }
  return out.sort((a, b) => a.line - b.line);
}
