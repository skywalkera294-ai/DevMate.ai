import type { Finding } from '../types';
import { splitLines, findMatches, findingId, isCodeFile, isTestFile, indentationOf } from '../utils';

const JS_TS = ['javascript', 'typescript'];

export function runCodeReview(files: Array<{ path: string; content: string; language: string }>): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    if (!isCodeFile(file.path) || isTestFile(file.path)) continue;
    const lang = file.language;
    const lines = splitLines(file.content);
    const noStrings = file.content.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, ' ');

    // --- Long functions / methods ---
    if (JS_TS.includes(lang) || lang === 'python') {
      let braceStart = -1;
      let braceDepth = 0;
      for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        if (lang === 'python') {
          if (/^(?:async\s+)?def\s+\w+/.test(t)) {
            const indent = indentationOf(lines[i]);
            let count = 0;
            for (let j = i + 1; j < lines.length; j++) {
              if (!lines[j].trim()) continue;
              if (indentationOf(lines[j]) <= indent && !lines[j].trim().startsWith('#') && !lines[j].trim().startsWith('@')) break;
              count++;
            }
            if (count > 60) {
              findings.push({
                id: findingId(),
                severity: 'medium',
                title: 'Overly long function',
                description: `Function at line ${i + 1} is ${count} lines long. Consider splitting it into smaller, single-responsibility functions.`,
                file: file.path,
                line: i + 1,
                category: 'maintainability',
                suggestion: 'Refactor into smaller functions that each do one thing and are easy to test.',
              });
            }
          }
        } else {
          if (t.includes('{')) {
            if (braceStart === -1) {
              braceStart = i;
              braceDepth = (t.match(/{/g) || []).length - (t.match(/}/g) || []).length;
            } else {
              braceDepth += (t.match(/{/g) || []).length - (t.match(/}/g) || []).length;
              if (braceDepth <= 0) {
                if (i - braceStart > 60) {
                  findings.push({
                    id: findingId(),
                    severity: 'medium',
                    title: 'Overly long block',
                    description: `Block spanning lines ${braceStart + 1}-${i + 1} is ${i - braceStart + 1} lines. Consider extracting it into a named function.`,
                    file: file.path,
                    line: braceStart + 1,
                    category: 'maintainability',
                    suggestion: 'Extract the block into a well-named helper function.',
                  });
                }
                braceStart = -1;
              }
            }
          } else if (t.includes('}')) {
            braceDepth -= (t.match(/}/g) || []).length;
            if (braceDepth <= 0) braceStart = -1;
          }
        }
      }
    }

    // --- Duplicate code blocks ---
    const seen = new Map<string, { count: number; line: number }>();
    for (let i = 0; i <= lines.length - 8; i++) {
      const block = lines.slice(i, i + 8).map((l) => l.trim()).filter(Boolean).join('\n');
      if (block.length < 60) continue;
      const key = block.replace(/\b\w+\b/g, 'X');
      if (seen.has(key)) {
        const existing = seen.get(key)!;
        existing.count += 1;
        if (existing.count === 2) {
          findings.push({
            id: findingId(),
            severity: 'medium',
            title: 'Duplicate code block',
            description: `Near-identical ${8}-line block detected at line ${existing.line} and line ${i + 1}. Duplicated logic makes bugs easy to introduce in one place and forget the other.`,
            file: file.path,
            line: i + 1,
            category: 'duplication',
            suggestion: 'Extract the shared logic into a reusable function or constant.',
          });
        }
      } else {
        seen.set(key, { count: 1, line: i + 1 });
      }
    }

    // --- Dangerous / banned APIs ---
    const banned: Array<{ re: RegExp; sev: 'critical' | 'high' | 'medium' | 'low' | 'info'; title: string; desc: string; sugg: string; cat: string }> = [];
    if (JS_TS.includes(lang)) {
      banned.push(
        { re: /\beval\s*\(/g, sev: 'high', title: 'Use of eval()', desc: 'eval() executes arbitrary code and is a common source of injection vulnerabilities.', sugg: 'Use JSON.parse, Function constructors, or a proper parser instead.', cat: 'security' },
        { re: /\bnew\s+Function\s*\(/g, sev: 'medium', title: 'Dynamic code execution', desc: 'new Function() compiles strings into code and should be avoided with untrusted input.', sugg: 'Avoid dynamic compilation; use explicit logic.', cat: 'security' },
        { re: /\bdocument\.write\s*\(/g, sev: 'high', title: 'document.write used', desc: 'document.write() blocks rendering and is dangerous with dynamic content.', sugg: 'Use DOM APIs such as textContent or innerHTML with escaping.', cat: 'quality' },
      );
    }
    if (lang === 'python') {
      banned.push(
        { re: /\beval\s*\(/g, sev: 'high', title: 'Use of eval()', desc: 'eval() runs arbitrary code and can break sandboxing.', sugg: 'Use ast.literal_eval for literals or a real parser.', cat: 'security' },
        { re: /\bexec\s*\(/g, sev: 'high', title: 'Use of exec()', desc: 'exec() executes arbitrary code strings.', sugg: 'Avoid dynamic execution; validate input strictly.', cat: 'security' },
        { re: /\bpickle\.load/g, sev: 'high', title: 'Unsafe pickle.load', desc: 'Loading pickles from untrusted sources can execute arbitrary code.', sugg: 'Use a safe serialization format like JSON.', cat: 'security' },
      );
    }
    if (lang === 'php') {
      banned.push(
        { re: /\beval\s*\(/g, sev: 'high', title: 'Use of eval()', desc: 'eval() executes arbitrary code.', sugg: 'Avoid eval; use a safe alternative.', cat: 'security' },
        { re: /\bmysql_query\s*\(/g, sev: 'high', title: 'Legacy mysql_query', desc: 'mysql_query is deprecated and unsafe. Use prepared statements with PDO.', sugg: 'Use PDO with prepared statements.', cat: 'security' },
      );
    }
    if (lang === 'java' || lang === 'csharp' || lang === 'kotlin') {
      banned.push(
        { re: /(System\.gc\s*\(|GC\.Collect\s*\()/g, sev: 'low', title: 'Manual garbage collection hint', desc: 'Manually invoking the garbage collector usually hurts performance.', sugg: 'Let the runtime manage memory automatically.', cat: 'performance' },
      );
    }
    for (const b of banned) {
      for (const m of findMatches(noStrings, b.re)) {
        findings.push({
          id: findingId(),
          severity: b.sev,
          title: b.title,
          description: b.desc,
          file: file.path,
          line: m.line,
          code: m.text,
          suggestion: b.sugg,
          category: b.cat,
        });
      }
    }

    // --- Empty catch / exception swallowing ---
    for (const re of [/\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/g, /\bexcept\s+(?:[^:]+)?:\s*$/gm]) {
      for (const m of findMatches(file.content, re, ['g'])) {
        const next = (lines[m.line] ?? '').trim();
        if (m.line < lines.length && next !== '') {
          const nextLine = lines[m.line - 1];
          if (nextLine.trim() !== 'pass') continue;
        }
        findings.push({
          id: findingId(),
          severity: 'medium',
          title: 'Exception silently swallowed',
          description: 'Empty catch/except block hides errors and makes debugging much harder.',
          file: file.path,
          line: m.line,
          code: m.text,
          suggestion: 'Log the error with context and re-throw when appropriate.',
          category: 'error-handling',
        });
      }
    }

    // --- TODOs ---
    for (const m of findMatches(file.content, /\b(TODO|FIXME|HACK|XXX)\b/i)) {
      findings.push({
        id: findingId(),
        severity: 'info',
        title: `${m.match!.toUpperCase()} comment left in code`,
        description: 'Unresolved marker comment found. Decide whether this is still relevant or create a tracked task.',
        file: file.path,
        line: m.line,
        code: m.text,
        category: 'maintainability',
        suggestion: 'Resolve the item or convert it into a GitHub issue.',
      });
    }

    // --- console.log left in production ---
    if (JS_TS.includes(lang)) {
      for (const m of findMatches(noStrings, /\bconsole\.(log|debug)\s*\(/g)) {
        findings.push({
          id: findingId(),
          severity: 'low',
          title: 'Debug logging left in code',
          description: 'console.log/debug calls are often left behind during development.',
          file: file.path,
          line: m.line,
          code: m.text,
          suggestion: 'Use a structured logger with levels, or remove the call.',
          category: 'quality',
        });
      }
    }

    // --- Magic numbers ---
    const magic = findMatches(noStrings, /[^A-Za-z0-9_](\d{3,})[^A-Za-z0-9_]/g);
    if (magic.length > 0) {
      for (const m of magic.slice(0, 3)) {
        findings.push({
          id: findingId(),
          severity: 'low',
          title: 'Magic number',
          description: `Literal ${m.match} appears in code. Values like this are hard to understand and maintain.`,
          file: file.path,
          line: m.line,
          code: m.text,
          suggestion: 'Extract the value into a named constant.',
          category: 'maintainability',
        });
      }
    }

    // --- JS/TS: loose equality ---
    if (JS_TS.includes(lang)) {
      for (const m of findMatches(noStrings, /[^=!<>]==[^=]/g)) {
        findings.push({
          id: findingId(),
          severity: 'medium',
          title: 'Loose equality (==)',
          description: 'Using == performs type coercion which can mask subtle bugs.',
          file: file.path,
          line: m.line,
          code: m.text,
          suggestion: 'Use strict equality ===.',
          category: 'correctness',
        });
        break;
      }
    }

    // --- React: missing key in lists ---
    if (lang === 'javascript' || lang === 'typescript') {
      const keyless = file.content.match(/\.map\s*\(/g);
      const hasKeys = /key\s*=\s*/.test(file.content);
      if (keyless && keyless.length > 0 && !hasKeys) {
        findings.push({
          id: findingId(),
          severity: 'medium',
          title: 'List items rendered without keys',
          description: 'React lists mapped without key props can cause rendering bugs and state corruption.',
          file: file.path,
          category: 'correctness',
          suggestion: 'Provide a stable, unique key for each item.',
        });
      }
    }

    // --- Redundant redefinition / shadowing: detect `const` inside loop ---
    // --- Unused variables (rough) ---
    for (const varm of findMatches(noStrings, /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
      const name = varm.match!;
      if (!name) continue;
      const declaration = new RegExp(`\\b${name}\\s*=`).test(noStrings);
      const usage = new RegExp(`[^A-Za-z0-9_$]${name}[^A-Za-z0-9_$=]`).test(noStrings);
      if (declaration && !usage) {
        findings.push({
          id: findingId(),
          severity: 'low',
          title: `Unused variable "${name}"`,
          description: 'A declared variable is never used.',
          file: file.path,
          line: varm.line,
          code: varm.text,
          suggestion: 'Remove the declaration or use the value.',
          category: 'dead-code',
        });
      }
    }
  }
  return findings;
}
