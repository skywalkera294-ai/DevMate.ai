import type { AnalyzerContext, Finding, LlmProvider, ScanResult } from './types';
import { runCodeReview } from './rules/code-review';
import { runBugDetection } from './rules/bugs';
import { runSecurityScan } from './rules/security';
import { runPerformanceAnalysis } from './rules/performance';
import { estimateComplexity, splitLines, isCodeFile, isTestFile } from './utils';

/** Cap for code content sent to the LLM; the provider clamps the full prompt too. */
const LLM_CONTENT_LIMIT = 40_000;

export async function generatePrReview(ctx: AnalyzerContext, llm: LlmProvider): Promise<ScanResult> {
  const findings: Finding[] = [];
  const changedFiles: Array<{ path: string; additions: number; deletions: number; complexity: number }> = [];
  const headPaths = new Set(ctx.files.map((f) => f.path));

  const codeFiles = ctx.files.filter((f) => isCodeFile(f.path) && !isTestFile(f.path) && !f.path.startsWith('base/'));

  findings.push(
    ...runCodeReview(codeFiles).map((f) => ({ ...f, id: `pr-${f.id}` })),
    ...runBugDetection(codeFiles).map((f) => ({ ...f, id: `pr-${f.id}` })),
    ...runSecurityScan(codeFiles).map((f) => ({ ...f, id: `pr-${f.id}` })),
    ...runPerformanceAnalysis(codeFiles).map((f) => ({ ...f, id: `pr-${f.id}` })),
  );

  for (const file of codeFiles) {
    const lines = splitLines(file.content);
    const codeLines = lines.filter((l) => l.trim()).length;
    const complexity = estimateComplexity(file.content);
    changedFiles.push({ path: file.path, additions: codeLines, deletions: 0, complexity });
  }

  const missingTests: string[] = [];
  for (const f of codeFiles) {
    const base = f.path.replace(/\.(ts|tsx|js|jsx)$/, '');
    const testVariants = [`${base}.test.ts`, `${base}.test.tsx`, `${base}.test.js`, `${base}.spec.ts`, `${base}.spec.js`, `${f.path.replace(/\.py$/, '')}_test.py`];
    if (!testVariants.some((t) => headPaths.has(t))) {
      missingTests.push(f.path);
    }
  }

  const security = findings.filter((f) => ['critical', 'high'].includes(f.severity) && ['security', 'secrets', 'sql-injection', 'xss', 'command-injection'].includes(f.category || ''));
  const bugs = findings.filter((f) => ['high', 'critical'].includes(f.severity) && !security.includes(f));

  const totalComplexity = changedFiles.reduce((s, f) => s + f.complexity, 0);
  const riskLevel = totalComplexity > 40 || security.length > 0 ? 'High' : totalComplexity > 15 ? 'Medium' : 'Low';

  const staticReport = buildStaticReport(ctx, changedFiles, findings, security, bugs, missingTests, totalComplexity, riskLevel);

  let llmReview: string | null = null;
  let usedLlm = false;
  if (llm.available && codeFiles.length > 0) {
    try {
      llmReview = await llm.complete(
        'You are DevMate AI, an expert code reviewer. Review the pull request below and respond in GitHub-flavored markdown with exactly these sections: ' +
          '## Summary, ### What changed, ### Risks, ### Suggested improvements. Be specific, reference exact file paths, and only raise issues that are actually present in the diff. ' +
          'Keep it under 500 words.',
        buildLlmPrompt(ctx, codeFiles, findings),
      );
      usedLlm = true;
    } catch {
      llmReview = null;
    }
  }

  const markdown = llmReview
    ? [llmReview.trim(), '', '---', '', '## Static Analysis', '', staticReport].join('\n')
    : staticReport;

  const scores = [
    { label: 'Code Quality', value: Math.max(40, 100 - findings.filter((f) => f.severity !== 'info').length * 6), max: 100 },
    { label: 'Security', value: Math.max(20, 100 - security.length * 25), max: 100 },
    { label: 'Test Coverage', value: changedFiles.length ? Math.round(((changedFiles.length - missingTests.length) / changedFiles.length) * 100) : 0, max: 100 },
  ];

  const summary = llmReview
    ? `AI review complete. ${findings.length} finding(s) from static analysis, ${security.length} security concern(s), ${missingTests.length} file(s) missing tests.`
    : `Reviewed ${changedFiles.length} changed file(s). Risk: ${riskLevel}. ${findings.length} finding(s), ${security.length} security concern(s), ${missingTests.length} file(s) missing tests.`;

  return {
    summary,
    markdown,
    findings,
    scores,
    data: { changedFiles, missingTests, complexityScore: totalComplexity, riskLevel, usedLlm },
  };
}

function buildStaticReport(
  ctx: AnalyzerContext,
  changedFiles: Array<{ path: string; additions: number; deletions: number; complexity: number }>,
  findings: Finding[],
  security: Finding[],
  bugs: Finding[],
  missingTests: string[],
  totalComplexity: number,
  riskLevel: string,
): string {
  const md: string[] = [
    `## PR Review: ${ctx.prTitle || ctx.repoName || 'Pull Request'}`,
    '',
    ctx.prBody ? `> ${ctx.prBody.slice(0, 200)}` : '',
    '',
    `**Risk level:** ${riskLevel} · **Changed files:** ${changedFiles.length} · **Findings:** ${findings.length}`,
    '',
    '### Summary',
    '',
    `This change touches ${changedFiles.length} file(s) with a combined complexity score of ${totalComplexity}. ${security.length} security concern(s) and ${bugs.length} high-severity issue(s) were flagged.`,
    '',
    '### Changed Files',
    '',
    '| File | Complexity |',
    '| ---- | ---------- |',
    ...changedFiles.map((f) => `| \`${f.path}\` | ${f.complexity} |`),
    '',
    '### Risks',
    '',
    ...findings.filter((f) => ['high', 'critical'].includes(f.severity)).slice(0, 8).map((f) => `- **${f.title}** (\`${f.file}\`) — ${f.description}`),
    '',
    '### Security Concerns',
    '',
    ...(security.length ? security.slice(0, 8).map((f) => `- **${f.title}** (\`${f.file}\`) — ${f.suggestion}`) : ['_No critical security concerns detected._']),
    '',
    '### Suggested Improvements',
    '',
    ...findings.filter((f) => f.severity === 'medium').slice(0, 8).map((f) => `- ${f.title} (\`${f.file}\`): ${f.suggestion}`),
    '',
    '### Missing Tests',
    '',
    ...(missingTests.length ? missingTests.slice(0, 8).map((t) => `- \`${t}\``) : ['_All changed files have a corresponding test._']),
    '',
    '### Complexity Score',
    '',
    `**${totalComplexity}** (sum of cyclomatic-style points). ${riskLevel === 'High' ? 'Recommend splitting the change and adding tests.' : 'Reasonable for review.'}`,
    '',
  ];
  return md.join('\n');
}

function buildLlmPrompt(ctx: AnalyzerContext, codeFiles: Array<{ path: string; content: string }>, findings: Finding[]): string {
  const head = [
    ctx.repoName ? `Repository: ${ctx.repoName}` : '',
    ctx.prTitle ? `PR title: ${ctx.prTitle}` : '',
    ctx.prBody ? `PR description: ${ctx.prBody.slice(0, 500)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  let code = '';
  for (const f of codeFiles) {
    if (code.length >= LLM_CONTENT_LIMIT) {
      code += `\n\n…[remaining files truncated]\n`;
      break;
    }
    const slice = f.content.slice(0, LLM_CONTENT_LIMIT - code.length);
    code += `\n\n### FILE ${f.path}\n${slice}`;
  }

  const hints = findings.slice(0, 12).map((f) => `- [${f.severity}] ${f.title}${f.file ? ` (${f.file})` : ''}`).join('\n');

  return `${head}\n\n### Changed files:\n${code}\n\n### Static analysis hints (verify before repeating):\n${hints || '- none'}\n`;
}
