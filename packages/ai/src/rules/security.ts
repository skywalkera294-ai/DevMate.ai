import type { Finding } from '../types';
import { findMatches, findingId, isCodeFile, isTestFile } from '../utils';

const SECRET_PATTERNS = [
  { re: /(api[_-]?key|apikey|secret[_-]?key|access[_-]?token|client[_-]?secret|auth[_-]?token|private[_-]?key)\s*[:=]\s*['"][^'"]{8,}['"]/gi, title: 'Hardcoded secret or API key', sev: 'critical' as const },
  { re: /(password|passwd|pwd)\s*[:=]\s*['"][^'"]{6,}['"]/gi, title: 'Hardcoded password', sev: 'critical' as const },
  { re: /sk-[A-Za-z0-9]{20,}/g, title: 'Exposed API key format', sev: 'critical' as const },
  { re: /(AKIA|ASIA)[A-Z0-9]{16}/g, title: 'AWS access key detected', sev: 'critical' as const },
  { re: /ghp_[A-Za-z0-9]{20,}/g, title: 'GitHub personal access token', sev: 'critical' as const },
  { re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, title: 'Private key committed', sev: 'critical' as const },
];

export function runSecurityScan(files: Array<{ path: string; content: string; language: string }>): Finding[] {
  const findings: Finding[] = [];
  const secrets: Finding[] = [];
  const sql: Finding[] = [];
  const xss: Finding[] = [];
  const dangerous: Finding[] = [];
  const weakAuth: Finding[] = [];
  const deps: Finding[] = [];

  for (const file of files) {
    if (!isCodeFile(file.path) || isTestFile(file.path)) continue;
    const content = file.content;
    const lang = file.language;
    const noStrings = content.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, ' ');

    // --- Secrets ---
    for (const p of SECRET_PATTERNS) {
      for (const m of findMatches(content, p.re)) {
        secrets.push({
          id: findingId(),
          severity: p.sev,
          title: p.title,
          description: 'Sensitive credentials embedded in source code can be exposed via the repository, CI logs, and package artifacts.',
          file: file.path,
          line: m.line,
          code: redact(m.text),
          suggestion: 'Rotate the credential immediately, move it to a secret manager / environment variable, and add it to .gitignore.',
          category: 'secrets',
        });
      }
    }

    // --- SQL injection ---
    if (['python', 'javascript', 'typescript', 'php', 'java', 'csharp', 'go'].includes(lang)) {
      const sqlKeyword = /\b(SELECT|INSERT|UPDATE|DELETE|CREATE)\b/i;
      const dynamicMarker = /(\+\s*["'`]|["'`]\s*\+|\.format\s*\(|f["']|\$\{|%s|%\(|\.execute\s*\(|\.query\s*\([^)]*\+)/i;
      const lines = content.split('\n');
      const found: Array<{ line: number; text: string }> = [];
      for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        if (!sqlKeyword.test(t) || !dynamicMarker.test(t)) continue;
        if (/^\s*[#/]/.test(t)) continue;
        found.push({ line: i + 1, text: t });
      }
      for (const f of found) {
          sql.push({
            id: findingId(),
            severity: 'critical',
            title: 'Possible SQL injection',
            description: 'SQL statements built with string concatenation or formatting can be exploited to inject arbitrary SQL.',
            file: file.path,
            line: f.line,
            code: redact(f.text),
            suggestion: 'Use parameterized queries / prepared statements (?, :name) and validate inputs.',
            category: 'sql-injection',
          });
      }
    }

    // --- XSS ---
    if (['javascript', 'typescript'].includes(lang)) {
      for (const m of findMatches(content, /(innerHTML\s*=|outerHTML\s*=|document\.write\s*\(|insertAdjacentHTML\s*\(|dangerouslySetInnerHTML)/g)) {
        xss.push({
          id: findingId(),
          severity: 'high',
          title: 'Potential cross-site scripting (XSS)',
          description: 'Setting raw HTML from dynamic values can allow script injection if the value is user-controlled.',
          file: file.path,
          line: m.line,
          code: m.text,
          suggestion: 'Escape dynamic values, use textContent, or sanitize with a library like DOMPurify.',
          category: 'xss',
        });
      }
    }
    if (lang === 'python') {
      for (const m of findMatches(content, /\bmark_safe\s*\(|{%\s*autoescape\s+off\s*%}/g)) {
        xss.push({
          id: findingId(),
          severity: 'high',
          title: 'Potential XSS (autoescape disabled)',
          description: 'Disabling autoescaping or marking content safe can lead to XSS.',
          file: file.path,
          line: m.line,
          code: m.text,
          suggestion: 'Re-enable autoescape and escape all user-provided data.',
          category: 'xss',
        });
      }
    }

    // --- Dangerous execution ---
    if (['python', 'javascript', 'typescript', 'go', 'java', 'php'].includes(lang)) {
      for (const m of findMatches(noStrings, /\b(exec|system|spawn|child_process\.exec|os\.system|subprocess\.(call|run|Popen))\s*\(/g)) {
        dangerous.push({
          id: findingId(),
          severity: 'high',
          title: 'Shell/process execution of dynamic input',
          description: 'Executing commands with interpolation of user input enables command injection.',
          file: file.path,
          line: m.line,
          code: m.text,
          suggestion: 'Avoid shell execution; pass arguments as arrays (no shell), validate/whitelist input.',
          category: 'command-injection',
        });
      }
    }

    // --- Weak auth handling ---
    if (['javascript', 'typescript', 'php', 'python', 'go', 'java'].includes(lang)) {
      for (const m of findMatches(noStrings, /password\s*==\s*[^;]+|passwd\s*==\s*[^;]+/g)) {
        weakAuth.push({
          id: findingId(),
          severity: 'critical',
          title: 'Plaintext password comparison',
          description: 'Comparing passwords in plaintext is insecure; there is no hashing.',
          file: file.path,
          line: m.line,
          code: m.text,
          suggestion: 'Store and verify passwords with a strong hash (bcrypt/argon2) using constant-time comparison.',
          category: 'authentication',
        });
      }
      for (const m of findMatches(noStrings, /\bMD5\s*\(|\bSHA1\s*\(/g)) {
        weakAuth.push({
          id: findingId(),
          severity: 'medium',
          title: 'Weak hashing algorithm',
          description: 'MD5/SHA1 are not suitable for password hashing.',
          file: file.path,
          line: m.line,
          code: m.text,
          suggestion: 'Use bcrypt, argon2, or scrypt for passwords.',
          category: 'crypto',
        });
      }
    }

    // --- Unsafe dependencies ---
    const UNSAFE = ['left-pad', 'event-stream', 'ua-parser-js', 'underscore@1.8', 'lodash@<4.17.21'];
    for (const dep of UNSAFE) {
      if (content.includes(dep)) {
        deps.push({
          id: findingId(),
          severity: 'medium',
          title: `Potentially unsafe dependency: ${dep}`,
          description: `Package "${dep}" is associated with known vulnerabilities or supply-chain incidents.`,
          file: file.path,
          suggestion: 'Upgrade to a maintained version and verify the supply chain.',
          category: 'dependencies',
        });
      }
    }

    // --- Missing input validation / weak handling ---
    if (lang === 'javascript' || lang === 'typescript') {
      for (const m of findMatches(noStrings, /\bparseInt\s*\([^)]*,\s*(?!10\b)[^)]*\)/g)) {
        findings.push({
          id: findingId(),
          severity: 'low',
          title: 'parseInt without radix 10',
          description: 'Non-10 radix parseInt can produce surprising results.',
          file: file.path,
          line: m.line,
          code: m.text,
          suggestion: 'Use parseInt(x, 10) or Number(x).',
          category: 'validation',
        });
      }
    }
  }

  const dedupe = (list: Finding[]) => list.filter((f, i) => i === 0 || list.findIndex((x) => x.title === f.title && x.line === f.line) === i);

  findings.push(...dedupe(secrets), ...dedupe(sql), ...dedupe(xss), ...dedupe(dangerous), ...dedupe(weakAuth), ...dedupe(deps));

  if (findings.length === 0) {
    findings.push({
      id: findingId(),
      severity: 'low',
      title: 'No obvious vulnerabilities detected',
      description: 'Automated static scan found no common vulnerability patterns in the scanned code.',
      category: 'summary',
    });
  }

  return findings;
}

function redact(text: string): string {
  return text.length > 160 ? text.slice(0, 160) + '…' : text;
}
