import type { Finding } from '../types';
import { splitLines, findMatches, findingId, isCodeFile, isTestFile, stripStrings } from '../utils';

const JS_TS = ['javascript', 'typescript'];

export function runBugDetection(files: Array<{ path: string; content: string; language: string }>): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    if (!isCodeFile(file.path) || isTestFile(file.path)) continue;
    const lang = file.language;
    const lines = splitLines(file.content);
    const noStrings = stripStrings(file.content);

    // --- Infinite loops ---
    for (const m of findMatches(noStrings, /\bwhile\s*\(\s*true\s*\)/g)) {
      const loopStart = m.line;
      let guarded = false;
      for (let i = loopStart; i < Math.min(lines.length, loopStart + 40); i++) {
        if (/\bbreak\b/.test(lines[i])) { guarded = true; break; }
        if (lines[i].trim() === '}' && i > loopStart) break;
      }
      if (!guarded) {
        findings.push({
          id: findingId(),
          severity: 'high',
          title: 'Potential infinite loop',
          description: 'A while(true) loop was found without a break statement nearby.',
          file: file.path,
          line: loopStart,
          code: m.text,
          suggestion: 'Add a terminating condition or break path.',
          category: 'control-flow',
        });
      }
    }
    if (lang === 'python') {
      for (const m of findMatches(noStrings, /\bwhile\s+True\s*:/g)) {
        const loopStart = m.line;
        let guarded = false;
        for (let i = loopStart; i < Math.min(lines.length, loopStart + 40); i++) {
          if (/\bbreak\b/.test(lines[i])) { guarded = true; break; }
          if (i > loopStart && indentationIsRoot(lines[i], lines, loopStart)) break;
        }
        if (!guarded) {
          findings.push({
            id: findingId(),
            severity: 'high',
            title: 'Potential infinite loop',
            description: 'A while True loop was found without a break statement nearby.',
            file: file.path,
            line: loopStart,
            code: m.text,
            suggestion: 'Add a terminating condition or break path.',
            category: 'control-flow',
          });
        }
      }
    }
    // for(;;)
    for (const m of findMatches(noStrings, /for\s*\(\s*;\s*;\s*\)/g)) {
      findings.push({
        id: findingId(),
        severity: 'high',
        title: 'Unbounded for(;;) loop',
        description: 'for(;;) with no condition and no break can loop forever.',
        file: file.path,
        line: m.line,
        code: m.text,
        suggestion: 'Add a condition and a break path.',
        category: 'control-flow',
      });
    }

    // --- Null pointer risks: dereference right after assignment from possibly-null ---
    for (const m of findMatches(noStrings, /([A-Za-z_$][\w$]*)\s*=\s*([^;=\n]+);\s*\n\s*\1\./g)) {
      findings.push({
        id: findingId(),
        severity: 'medium',
        title: 'Possible null dereference',
        description: `Value assigned to ${m.match} is dereferenced immediately after assignment without a null check.`,
        file: file.path,
        line: m.line,
        code: m.text,
        suggestion: 'Null-check before accessing properties.',
        category: 'null-safety',
      });
    }
    // Optional chaining missing on possibly undefined calls (JS/TS)
    if (JS_TS.includes(lang)) {
      for (const m of findMatches(noStrings, /\b(this\.[\w$]+|[\w$]+)\s*\.\s*(?:[\w$]+)\s*\(/g)) {
        // only flag when a nearby undefined/null check exists in the file for the same var
        const varName = m.match;
        if (!varName) continue;
        if (new RegExp(`${varName}\\s*[?]?\\.`).test(noStrings) === false) continue;
      }
    }

    // --- Off-by-one: `<=` used with array/length indexing ---
    for (const m of findMatches(noStrings, /\bfor\s*\([^)]*<\s*=/g)) {
      if (/length\s*-/.test(noStrings)) continue;
      findings.push({
        id: findingId(),
        severity: 'low',
        title: 'Possible off-by-one loop',
        description: 'Loop uses `<=` on an upper bound; if the bound is an array length this skips one past the end.',
        file: file.path,
        line: m.line,
        code: m.text,
        suggestion: 'Use `<` when iterating over zero-based collections.',
        category: 'correctness',
      });
    }

    // --- Comparing NaN / undefined ---
    for (const m of findMatches(noStrings, /===?\s*NaN/g)) {
      findings.push({
        id: findingId(),
        severity: 'high',
        title: 'NaN comparison is always false',
        description: 'NaN never equals anything, including itself. This comparison will never match.',
        file: file.path,
        line: m.line,
        code: m.text,
        suggestion: 'Use Number.isNaN(x) instead.',
        category: 'correctness',
      });
    }
    for (const m of findMatches(noStrings, /!==?\s*undefined/g)) {
      if (JS_TS.includes(lang)) {
        findings.push({
          id: findingId(),
          severity: 'low',
          title: 'Explicit undefined comparison',
          description: 'Comparing against undefined directly; prefer truthiness checks or typeof.',
          file: file.path,
          line: m.line,
          code: m.text,
          suggestion: 'Use `x != null` to also catch null, or check typeof.',
          category: 'correctness',
        });
      }
    }

    // --- Dead code after return/throw/break ---
    for (let i = 0; i < lines.length - 1; i++) {
      const t = lines[i].trim();
      if (/^(return|throw|break|continue)\b/.test(t) && lines[i + 1].trim() !== '' && lines[i + 1].trim() !== '}') {
        const nextIndent = indent(lines[i + 1]);
        const curIndent = indent(lines[i]);
        if (nextIndent >= curIndent) {
          findings.push({
            id: findingId(),
            severity: 'medium',
            title: 'Unreachable code',
            description: 'Statements after return/throw/break at this level will never execute.',
            file: file.path,
            line: i + 2,
            code: lines[i + 1].trim(),
            suggestion: 'Remove the dead code or restructure the control flow.',
            category: 'dead-code',
          });
        }
      }
    }

    // --- Async: missing await on promise-returning call (JS/TS rough) ---
    if (JS_TS.includes(lang)) {
      const awaitedPromises = new Set<string>();
      for (const m of findMatches(noStrings, /\bawait\s+([A-Za-z_$][\w$]*)/g)) {
        if (m.match) awaitedPromises.add(m.match);
      }
      for (const m of findMatches(noStrings, /^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:Promise\.|fetch\s*\(|axios\.|\.then)/gm)) {
        if (m.match && !awaitedPromises.has(m.match)) {
          findings.push({
            id: findingId(),
            severity: 'medium',
            title: `Promise not awaited (${m.match})`,
            description: 'A promise is stored or fired without awaiting or .catch() handling, which can cause unhandled rejections.',
            file: file.path,
            line: m.line,
            code: m.text,
            suggestion: 'await the promise and handle errors.',
            category: 'async',
          });
        }
      }
      // .then chains without .catch
      for (const m of findMatches(noStrings, /\.then\s*\(/g)) {
        if (!/\.catch\s*\(/.test(noStrings)) {
          findings.push({
            id: findingId(),
            severity: 'medium',
            title: 'Promise chain without .catch()',
            description: 'Unhandled promise rejections can crash processes in Node and leave UI in bad states.',
            file: file.path,
            line: m.line,
            code: m.text,
            suggestion: 'Add .catch() or use async/await with try/catch.',
            category: 'async',
          });
          break;
        }
      }
    }

    // --- Memory: unbounded accumulation in loop ---
    for (const m of findMatches(noStrings, /\.push\s*\(/g)) {
      if (/for\s*\(/.test(file.content)) {
        findings.push({
          id: findingId(),
          severity: 'low',
          title: 'Array grows inside a loop',
          description: 'Unbounded array growth inside a loop can exhaust memory on large inputs.',
          file: file.path,
          line: m.line,
          code: m.text,
          suggestion: 'Pre-allocate capacity, or stream results if the list can be large.',
          category: 'memory',
        });
        break;
      }
    }
  }
  return findings;
}

function indent(line: string): number {
  return line.search(/\S/);
}

function indentationIsRoot(line: string, lines: string[], startLine: number): boolean {
  const base = indent(lines[startLine - 1]);
  return indent(line) <= base;
}
