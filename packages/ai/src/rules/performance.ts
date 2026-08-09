import type { Finding } from '../types';
import { findMatches, findingId, isCodeFile, isTestFile, splitLines } from '../utils';

export function runPerformanceAnalysis(files: Array<{ path: string; content: string; language: string }>): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();

  const push = (f: Omit<Finding, 'id'>) => {
    const key = `${f.file}|${f.line}|${f.title}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ ...f, id: findingId() });
  };

  for (const file of files) {
    if (!isCodeFile(file.path) || isTestFile(file.path)) continue;
    const content = file.content;
    const lang = file.language;
    const lines = splitLines(content);
    const noStrings = content.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, ' ');

    // --- Large files ---
    if (lines.length > 800) {
      push({
        severity: 'medium',
        title: 'Very large source file',
        description: `File has ${lines.length} lines; large files slow parsing, bundling, and incremental builds.`,
        file: file.path,
        line: 1,
        category: 'bundle',
        suggestion: 'Split into modules and lazy-load where possible.',
      });
    }

    // --- Nested loops (O(n^2)) ---
    for (const m of findMatches(noStrings, /\bfor\s*\([^)]*\)\s*\{/g)) {
      const open = m.line;
      let depth = 1;
      for (let i = open; i < Math.min(lines.length, open + 60); i++) {
        depth += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
        if (depth <= 0) break;
        if (/^\s*for\s*\(/.test(lines[i]) && i > open - 1) {
          push({
            severity: 'medium',
            title: 'Nested loop (quadratic complexity)',
            description: 'Loops nested inside loops run in O(n²) time; performance degrades rapidly with input size.',
            file: file.path,
            line: open,
            code: lines[open - 1].trim(),
            category: 'complexity',
            suggestion: 'Use hash maps/indexes to avoid inner scans, or restructure the algorithm.',
          });
          break;
        }
      }
    }
    if (lang === 'python') {
      for (const m of findMatches(noStrings, /^\s*for\s+[\w.]+\s+in\s+/gm)) {
        const open = m.line;
        const indent = indentOf(lines[open - 1]);
        for (let i = open; i < Math.min(lines.length, open + 60); i++) {
          if (!lines[i].trim() || lines[i].trim().startsWith('#')) continue;
          if (indentOf(lines[i]) <= indent) break;
          if (/^\s*for\s+[\w.]+\s+in\s+/.test(lines[i])) {
            push({
              severity: 'medium',
              title: 'Nested loop (quadratic complexity)',
              description: 'Loops nested inside loops run in O(n²) time.',
              file: file.path,
              line: open,
              code: lines[open - 1].trim(),
              category: 'complexity',
              suggestion: 'Pre-compute lookups in a dict/set outside the inner loop.',
            });
            break;
          }
        }
      }
    }

    // --- Await in loop (serialized I/O) ---
    for (const m of findMatches(noStrings, /\bawait\b/g)) {
      const open = m.line;
      let inLoop = false;
      let depth = 0;
      for (let i = open - 1; i >= 0 && i > open - 40; i--) {
        const t = lines[i];
        if (/^\s*for\s*\(|\bwhile\s*\(|\.forEach\s*\(|\.map\s*\(/.test(t)) { inLoop = true; break; }
        depth += (t.match(/}/g) || []).length - (t.match(/\{/g) || []).length;
        if (depth < 0) break;
      }
      if (inLoop) {
        push({
          severity: 'high',
          title: 'await inside a loop (serial I/O)',
          description: 'Awaiting inside a loop serializes requests, adding latency per iteration.',
          file: file.path,
          line: open,
          code: lines[open - 1].trim(),
          category: 'async',
          suggestion: 'Use Promise.all to parallelize independent operations.',
        });
        break;
      }
    }

    // --- DOM queries in loops ---
    for (const m of findMatches(noStrings, /document\.querySelector(All)?\s*\(/g)) {
      const open = m.line;
      let inLoop = false;
      for (let i = open - 1; i >= 0 && i > open - 30; i--) {
        if (/^\s*for\s*\(|\.forEach\s*\(|\.map\s*\(/.test(lines[i])) { inLoop = true; break; }
      }
      if (inLoop) {
        push({
          severity: 'medium',
          title: 'DOM query inside a loop',
          description: 'Repeated DOM lookups force layout/reflow and are slow.',
          file: file.path,
          line: open,
          code: lines[open - 1].trim(),
          category: 'dom',
          suggestion: 'Query the element once before the loop and reuse the reference.',
        });
      }
    }

    // --- Repeated .filter().map() etc in hot path (just informational) ---
    // --- Large regex rebuilt per call ---
    for (const m of findMatches(noStrings, /new\s+RegExp\s*\(/g)) {
      push({
        severity: 'low',
        title: 'RegExp rebuilt per call',
        description: 'Constructing RegExp inside a function creates a new compiled pattern on every call.',
        file: file.path,
        line: m.line,
        code: m.text,
        category: 'allocations',
        suggestion: 'Hoist the RegExp to module scope.',
      });
    }

    // --- Unbounded array/object growth (memory) ---
    for (const m of findMatches(noStrings, /\.push\s*\(|\.append\s*\(|\.add\s*\(/g)) {
      push({
        severity: 'low',
        title: 'Unbounded collection growth',
        description: 'Collections growing without bound can exhaust memory on large inputs.',
        file: file.path,
        line: m.line,
        code: m.text,
        category: 'memory',
        suggestion: 'Consider streaming, batching, or limits.',
      });
      break;
    }

    // --- Duplicate requests heuristic: identical fetch/axios URL strings ---
    const urlCounts = new Map<string, number>();
    for (const m of findMatches(content, /(fetch|axios\.\w+)\s*\(\s*['"]([^'"]+)['"]/g)) {
      const url = m.match?.split('(')[1] ?? '';
      urlCounts.set(url, (urlCounts.get(url) ?? 0) + 1);
    }
    for (const [url, count] of urlCounts) {
      if (count > 1 && url.startsWith('http')) {
        push({
          severity: 'medium',
          title: `Duplicate request to ${url}`,
          description: `The same endpoint URL is requested ${count} times; duplicate API calls waste bandwidth and add latency.`,
          file: file.path,
          category: 'network',
          suggestion: 'Cache the response or deduplicate concurrent requests.',
        });
      }
    }
  }

  return findings;
}

function indentOf(line: string): number {
  return line.search(/\S/);
}
