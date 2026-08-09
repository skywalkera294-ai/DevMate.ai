import type { AnalyzerContext, Section, ScanResult } from '../types';
import { countCodeLines, languageLabel, slugify } from '../utils';

interface ProjectProfile {
  name: string;
  language: string;
  packageManager: string;
  buildCmd: string;
  testCmd: string;
  runCmd: string;
  framework: string;
  hasDatabase: boolean;
  dbType: string;
  license: string;
  description: string;
}

export function detectProjectProfile(ctx: AnalyzerContext): ProjectProfile {
  const files = ctx.files.map((f) => f.path);
  const lower = files.map((f) => f.toLowerCase());
  const contents = new Map(ctx.files.map((f) => [f.path.toLowerCase(), f.content]));
  let language = 'TypeScript';
  if (lower.some((f) => f.endsWith('.py'))) language = 'Python';
  else if (lower.some((f) => f.endsWith('.go'))) language = 'Go';
  else if (lower.some((f) => f.endsWith('.rs'))) language = 'Rust';
  else if (lower.some((f) => f.endsWith('.java'))) language = 'Java';
  else if (lower.some((f) => f.endsWith('.php'))) language = 'PHP';
  else if (lower.some((f) => f.endsWith('.cs'))) language = 'C#';
  else if (lower.some((f) => f.endsWith('.swift'))) language = 'Swift';
  else if (lower.some((f) => f.endsWith('.kt'))) language = 'Kotlin';
  else if (lower.some((f) => f.endsWith('.c'))) language = 'C';
  else if (lower.some((f) => f.endsWith('.cpp') || f.endsWith('.hpp'))) language = 'C++';

  let packageManager = '';
  let buildCmd = '';
  let testCmd = '';
  let runCmd = '';
  let framework = '';
  let hasDatabase = false;
  let dbType = '';

  if (lower.includes('package.json')) {
    packageManager = 'npm';
    const pkg = parseJson(contents.get('package.json') ?? '');
    framework = pkg?.dependencies?.next ? 'Next.js' : pkg?.dependencies?.react ? 'React' : pkg?.dependencies?.express ? 'Express' : pkg?.dependencies?.['@nestjs/core'] ? 'NestJS' : pkg?.dependencies?.vue ? 'Vue' : '';
    buildCmd = pkg?.scripts?.build ? 'npm run build' : 'npm run dev';
    runCmd = pkg?.scripts?.dev ? 'npm run dev' : 'npm start';
    testCmd = pkg?.scripts?.test ? 'npm test' : 'npx jest';
    hasDatabase = Boolean(pkg?.dependencies?.prisma || pkg?.dependencies?.pg || pkg?.dependencies?.mysql2 || pkg?.dependencies?.mongoose);
    dbType = pkg?.dependencies?.prisma ? 'PostgreSQL/SQLite (Prisma)' : pkg?.dependencies?.pg ? 'PostgreSQL' : pkg?.dependencies?.mysql2 ? 'MySQL' : pkg?.dependencies?.mongoose ? 'MongoDB' : '';
  } else if (lower.includes('requirements.txt') || lower.includes('pyproject.toml')) {
    packageManager = 'pip';
    runCmd = 'python main.py';
    buildCmd = '';
    testCmd = 'pytest';
    framework = lower.some((f) => f.includes('manage.py') || f.includes('wsgi') || f.includes('asgi')) ? 'Django' : lower.includes('app.py') ? 'Flask' : '';
    hasDatabase = lower.some((f) => f.includes('models.py'));
    dbType = 'SQLite (default)';
  } else if (lower.includes('go.mod')) {
    packageManager = 'go mod';
    runCmd = 'go run .';
    buildCmd = 'go build ./...';
    testCmd = 'go test ./...';
    framework = '';
  } else if (lower.includes('cargo.toml')) {
    packageManager = 'cargo';
    runCmd = 'cargo run';
    buildCmd = 'cargo build --release';
    testCmd = 'cargo test';
    framework = '';
  } else if (lower.includes('pom.xml') || lower.includes('build.gradle')) {
    packageManager = 'maven';
    runCmd = 'mvn spring-boot:run';
    buildCmd = 'mvn package';
    testCmd = 'mvn test';
    framework = 'Spring Boot';
  } else if (lower.includes('composer.json')) {
    packageManager = 'composer';
    runCmd = 'php artisan serve';
    buildCmd = '';
    testCmd = 'php artisan test';
    framework = 'Laravel';
  }

  const licenseMatch = ctx.files.find((f) => /^licen[cs]e/i.test(f.path.split('/').pop() ?? ''));
  const license = licenseMatch ? 'See LICENSE file' : 'MIT';

  return {
    name: ctx.repoName || 'your-project',
    language,
    packageManager,
    buildCmd,
    testCmd,
    runCmd,
    framework,
    hasDatabase,
    dbType,
    license,
    description: ctx.description || `${language} project powered by DevMate AI.`,
  };
}

function parseJson(text: string): Record<string, any> | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function generateReadme(ctx: AnalyzerContext): ScanResult {
  const p = detectProjectProfile(ctx);
  const lines: string[] = [];

  lines.push(`# ${p.name}`);
  lines.push('');
  lines.push(`> ${p.description}`);
  lines.push('');
  lines.push(`![Badge](https://img.shields.io/badge/language-${encodeURIComponent(p.language)}-blue.svg) ![License](https://img.shields.io/badge/license-MIT-green.svg)`);
  lines.push('');
  lines.push('## Overview');
  lines.push('');
  lines.push(`**${p.name}** is a ${p.language}${p.framework ? ` (${p.framework})` : ''} application. This README was generated with DevMate AI.`);
  lines.push('');
  lines.push('## Features');
  lines.push('');
  lines.push('- **Core functionality** — describe the primary value the project delivers.');
  lines.push('- **Extensible** — clean module boundaries make it easy to add capabilities.');
  lines.push('- **Well-tested** — automated tests cover the critical paths.');
  lines.push('');
  lines.push('## Table of Contents');
  lines.push('');
  lines.push('- [Installation](#installation)');
  lines.push('- [Usage](#usage)');
  lines.push('- [Configuration](#configuration)');
  lines.push('- [Folder Structure](#folder-structure)');
  lines.push('- [API Documentation](#api-documentation)');
  lines.push('- [Contributing](#contributing)');
  lines.push('- [License](#license)');
  lines.push('');
  lines.push('## Installation');
  lines.push('');
  if (p.packageManager === 'npm') {
    lines.push('```bash');
    lines.push('# Clone the repository');
    lines.push('git clone https://github.com/your-org/' + p.name + '.git');
    lines.push('cd ' + p.name);
    lines.push('');
    lines.push('# Install dependencies');
    lines.push('npm install');
    lines.push('```');
  } else if (p.packageManager === 'pip') {
    lines.push('```bash');
    lines.push('git clone https://github.com/your-org/' + p.name + '.git');
    lines.push('cd ' + p.name);
    lines.push('python -m venv .venv');
    lines.push('source .venv/bin/activate  # Windows: .venv\\Scripts\\activate');
    lines.push('pip install -r requirements.txt');
    lines.push('```');
  } else if (p.packageManager === 'go mod') {
    lines.push('```bash');
    lines.push('go install github.com/your-org/' + p.name + '@latest');
    lines.push('```');
  } else if (p.packageManager === 'cargo') {
    lines.push('```bash');
    lines.push('cargo add ' + p.name);
    lines.push('```');
  } else {
    lines.push('```bash');
    lines.push('git clone https://github.com/your-org/' + p.name + '.git');
    lines.push('cd ' + p.name);
    lines.push('```');
  }
  lines.push('');
  lines.push('## Usage');
  lines.push('');
  lines.push('```bash');
  lines.push(p.runCmd || '# add your start command here');
  lines.push('```');
  lines.push('');
  if (p.buildCmd) {
    lines.push('### Build');
    lines.push('');
    lines.push('```bash');
    lines.push(p.buildCmd);
    lines.push('```');
    lines.push('');
  }
  if (p.testCmd) {
    lines.push('### Test');
    lines.push('');
    lines.push('```bash');
    lines.push(p.testCmd);
    lines.push('```');
    lines.push('');
  }
  lines.push('## Configuration');
  lines.push('');
  lines.push('Environment variables can be provided via a `.env` file. Copy the example and adjust values:');
  lines.push('');
  lines.push('```bash');
  lines.push('cp .env.example .env');
  lines.push('```');
  lines.push('');
  if (p.hasDatabase) {
    lines.push(`**Database:** ${p.dbType}`);
    lines.push('');
    lines.push('```bash');
    if (p.packageManager === 'npm') {
      lines.push('npx prisma migrate dev   # apply schema migrations');
    }
    lines.push('```');
    lines.push('');
  }
  lines.push('## Folder Structure');
  lines.push('');
  lines.push('```text');
  const tree = folderTree(ctx.files.map((f) => f.path));
  lines.push(tree);
  lines.push('```');
  lines.push('');
  lines.push('## API Documentation');
  lines.push('');
  lines.push('| Method | Endpoint | Description |');
  lines.push('| ------ | -------- | ----------- |');
  lines.push('| GET | `/api/health` | Service health check |');
  lines.push('');
  lines.push('_Replace with endpoints discovered in your codebase._');
  lines.push('');
  lines.push('## Screenshots');
  lines.push('');
  lines.push('<!-- Add screenshots here -->');
  lines.push('');
  lines.push('| Screenshot 1 | Screenshot 2 |');
  lines.push('| ------------ | ------------ |');
  lines.push('| ![Screenshot](url/to/screenshot1.png) | ![Screenshot](url/to/screenshot2.png) |');
  lines.push('');
  lines.push('## Contributing');
  lines.push('');
  lines.push('1. Fork the repository.');
  lines.push('2. Create a feature branch: `git checkout -b feat/my-feature`.');
  lines.push('3. Commit your changes following [Conventional Commits](https://www.conventionalcommits.org).');
  lines.push('4. Push and open a pull request.');
  lines.push('');
  lines.push('Please add tests for new functionality and update the documentation.');
  lines.push('');
  lines.push('## License');
  lines.push('');
  lines.push(`Distributed under the ${p.license} license.`);

  const markdown = lines.join('\n');
  const sections: Section[] = [
    { title: 'Overview', content: lines.slice(lines.indexOf('## Overview') + 1, lines.indexOf('## Features')).join('\n') },
    { title: 'Installation', content: lines.slice(lines.indexOf('## Installation') + 1, lines.indexOf('## Usage')).join('\n') },
    { title: 'Usage', content: lines.slice(lines.indexOf('## Usage') + 1, lines.indexOf('## Configuration')).join('\n') },
    { title: 'Folder Structure', content: '```text\n' + tree + '\n```' },
    { title: 'API Documentation', content: lines.slice(lines.indexOf('## API Documentation') + 1, lines.indexOf('## Screenshots')).join('\n') },
  ];

  return {
    summary: `Generated a professional README for **${p.name}** (${p.language}${p.framework ? ` · ${p.framework}` : ''}).`,
    markdown,
    sections,
    data: {
      profile: {
        name: p.name,
        language: p.language,
        framework: p.framework,
        packageManager: p.packageManager,
        runCmd: p.runCmd,
        buildCmd: p.buildCmd,
        testCmd: p.testCmd,
        dbType: p.dbType,
        totalCodeLines: ctx.files.reduce((s, f) => s + countCodeLines(f.content, f.language), 0),
      },
    },
  };
}

export function folderTree(paths: string[]): string {
  const root: any = { __name: '' };
  for (const p of paths) {
    const parts = p.split('/');
    let node = root;
    for (const part of parts) {
      node = node[part] ??= { __name: part, __isFile: true };
    }
  }
  const render = (node: any, prefix: string, isLast: boolean, out: string[]): void => {
    const keys = Object.keys(node).filter((k) => !k.startsWith('__'));
    keys.forEach((k, i) => {
      const child = node[k];
      const last = i === keys.length - 1;
      out.push(`${prefix}${last ? '└── ' : '├── '}${k}${child.__isFile ? '' : '/'}`);
      if (!child.__isFile) {
        render(child, prefix + (last ? '    ' : '│   '), last, out);
      }
    });
  };
  const out: string[] = [];
  const top = Object.keys(root).filter((k) => !k.startsWith('__'));
  if (top.length === 1) {
    const node = root[top[0]];
    if (!node.__isFile) {
      out.push(top[0] + '/');
      render(node, '', true, out);
      return out.join('\n');
    }
  }
  for (const k of top) out.push(k + (root[k].__isFile ? '' : '/'));
  return out.join('\n');
}

export function generateIssues(ctx: AnalyzerContext, findings: Array<{ severity: string; title: string; description: string; file?: string; line?: number; suggestion?: string; category?: string }>): Array<{ title: string; type: string; severity: string; body: string }> {
  const grouped = new Map<string, typeof findings>();
  for (const f of findings) {
    const cat = f.category || 'general';
    const key = f.title;
    const arr = grouped.get(key) ?? [];
    arr.push(f);
    grouped.set(key, arr);
  }
  const issues: Array<{ title: string; type: string; severity: string; body: string }> = [];
  for (const [title, items] of grouped) {
    const severity = items.some((i) => i.severity === 'critical' || i.severity === 'high') ? 'high' : 'medium';
    const type = title.toLowerCase().includes('security') || title.toLowerCase().includes('xss') || title.toLowerCase().includes('injection') || title.toLowerCase().includes('secret')
      ? 'SECURITY'
      : title.toLowerCase().includes('duplicate') || title.toLowerCase().includes('unused') || title.toLowerCase().includes('dead')
        ? 'TECH_DEBT'
        : title.toLowerCase().includes('doc') ? 'DOCS' : title.toLowerCase().includes('perf') || title.toLowerCase().includes('loop') ? 'PERFORMANCE' : 'BUG';
    const body = [
      `## Issue generated by DevMate AI`,
      '',
      items[0].description,
      '',
      '### Occurrences',
      '',
      ...items.slice(0, 10).map((i) => `- \`${i.file}\`${i.line ? `:${i.line}` : ''}${i.suggestion ? ` — ${i.suggestion}` : ''}`),
      '',
      '### Suggested fix',
      '',
      items[0].suggestion ? `> ${items[0].suggestion}` : 'Investigate and apply the recommended change.',
      '',
      `_Auto-generated from a DevMate AI scan._`,
    ].join('\n');
    issues.push({ title: `${title} (${items.length}×)`, type, severity, body });
  }
  return issues;
}

export function makeSummary(text: string, max = 140): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max).trimEnd() + '…' : clean;
}

export { slugify, languageLabel };
