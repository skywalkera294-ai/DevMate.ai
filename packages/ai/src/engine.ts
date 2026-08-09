import type { ScanType } from '@devmate/shared';
import type { AnalysisEngineOptions, AnalyzerContext, ChatTurn, Finding, LlmProvider, Score, ScanResult } from './types';
import { createLlmProvider } from './llm';
import { runCodeReview } from './rules/code-review';
import { runBugDetection } from './rules/bugs';
import { runSecurityScan } from './rules/security';
import { runPerformanceAnalysis } from './rules/performance';
import { generateReadme, generateIssues, makeSummary } from './generators/readme';
import { generateDocumentation } from './generators/docs';
import { generateTests } from './generators/tests';
import { generateDeploymentGuide } from './generators/deployment';
import { generatePrReview } from './pr-review';
import { generateArchitecture } from './architecture';
import { answerQuestion } from './chat';
import { estimateComplexity, isCodeFile, isTestFile, countCodeLines } from './utils';

export class AnalysisEngine {
  private readonly llm: LlmProvider;
  constructor(private readonly opts: AnalysisEngineOptions = {}) {
    this.llm = createLlmProvider(opts);
  }

  get llmAvailable(): boolean {
    return this.llm.available;
  }

  async run(type: ScanType, ctx: AnalyzerContext): Promise<ScanResult> {
    switch (type) {
      case 'CODE_REVIEW':
        return this.codeReview(ctx);
      case 'README':
        return generateReadme(ctx);
      case 'DOCUMENTATION':
        return generateDocumentation(ctx);
      case 'TEST_GENERATOR':
        return generateTests(ctx);
      case 'BUG_DETECTOR':
        return this.bugDetector(ctx);
      case 'SECURITY_SCANNER':
        return this.securityScanner(ctx);
      case 'PERFORMANCE':
        return this.performanceAnalyzer(ctx);
      case 'PR_REVIEW':
        return generatePrReview(ctx, this.llm);
      case 'ARCHITECTURE':
        return generateArchitecture(ctx);
      case 'ISSUES':
        return this.issueGenerator(ctx);
      case 'DEPLOYMENT':
        return generateDeploymentGuide(ctx);
      case 'REPO_CHAT':
        throw new Error('REPO_CHAT requires a query; use the chat endpoint instead.');
      default:
        throw new Error(`Unknown scan type: ${String(type)}`);
    }
  }

  async chat(
    query: string,
    ctx: AnalyzerContext,
    history: ChatTurn[] = [],
  ): Promise<{ text: string; citations: Array<{ path: string; line: number; snippet: string; score: number }>; usedLlm: boolean }> {
    const answer = await answerQuestion(query, ctx, this.llm, history);
    return answer;
  }

  private codeReview(ctx: AnalyzerContext): ScanResult {
    const findings = runCodeReview(ctx.files);
    const scores = this.reviewScores(ctx, findings);
    return {
      summary: makeSummary(`Reviewed ${ctx.files.length} file(s) and found ${findings.length} code-quality, correctness, and security issues.`),
      findings,
      scores,
      sections: [{ title: 'Scores', content: scores.map((s) => `${s.label}: ${s.value}/${s.max}`).join('\n') }],
    };
  }

  private bugDetector(ctx: AnalyzerContext): ScanResult {
    const findings = runBugDetection(ctx.files);
    const sections = this.groupByCategory(findings);
    return {
      summary: makeSummary(`Bug detection found ${findings.length} potential defects across ${ctx.files.length} file(s).`),
      findings,
      sections,
      scores: [{ label: 'Code Quality', value: Math.max(30, 100 - findings.length * 5), max: 100 }],
    };
  }

  private securityScanner(ctx: AnalyzerContext): ScanResult {
    const findings = runSecurityScan(ctx.files);
    const bySev = countBySeverity(findings);
    const critical = findings.filter((f) => f.severity === 'critical');
    const high = findings.filter((f) => f.severity === 'high');
    const score = Math.max(10, 100 - critical.length * 30 - high.length * 15 - findings.length * 3);
    return {
      summary: makeSummary(`Security scan found ${findings.length} issue(s): ${critical.length} critical, ${high.length} high. Overall security score ${score}/100.`),
      findings,
      scores: [{ label: 'Security Score', value: score, max: 100 }],
      sections: [
        { title: 'Severity Breakdown', content: ['Critical', 'High', 'Medium', 'Low', 'Info'].map((s) => `${s}: ${bySev[s.toLowerCase()] ?? 0}`).join('\n') },
        { title: 'Remediation', content: remediationAdvice(findings) },
      ],
    };
  }

  private performanceAnalyzer(ctx: AnalyzerContext): ScanResult {
    const findings = runPerformanceAnalysis(ctx.files);
    const score = Math.max(30, 100 - findings.length * 6);
    return {
      summary: makeSummary(`Performance analysis identified ${findings.length} optimization opportunities.`),
      findings,
      scores: [{ label: 'Performance Score', value: score, max: 100 }],
      sections: this.groupByCategory(findings),
    };
  }

  private issueGenerator(ctx: AnalyzerContext): ScanResult {
    const combined: Finding[] = [
      ...runCodeReview(ctx.files),
      ...runBugDetection(ctx.files),
      ...runSecurityScan(ctx.files),
      ...runPerformanceAnalysis(ctx.files),
    ];
    const issues = generateIssues(ctx, combined);
    return {
      summary: makeSummary(`Generated ${issues.length} actionable GitHub issues from the analysis.`),
      sections: issues.slice(0, 20).map((i) => ({ title: `${i.title}`, content: i.body })),
      data: { issues },
    };
  }

  private reviewScores(ctx: AnalyzerContext, findings: Finding[]): Score[] {
    const codeFiles = ctx.files.filter((f) => isCodeFile(f.path) && !isTestFile(f.path));
    const totalLoc = codeFiles.reduce((s, f) => s + countCodeLines(f.content, f.language), 0);
    const issueWeight = findings.reduce((s, f) => s + (f.severity === 'critical' ? 20 : f.severity === 'high' ? 12 : f.severity === 'medium' ? 6 : f.severity === 'low' ? 3 : 1), 0);
    const duplication = findings.filter((f) => f.category === 'duplication').length;
    const quality = Math.max(20, Math.min(100, 100 - issueWeight - duplication * 3));
    const complexityPerKLoc = totalLoc ? (codeFiles.reduce((s, f) => s + estimateComplexity(f.content), 0) / totalLoc) * 1000 : 0;
    const maintainability = Math.max(20, 100 - Math.round(complexityPerKLoc / 2));
    return [
      { label: 'Code Quality', value: quality, max: 100 },
      { label: 'Maintainability', value: maintainability, max: 100 },
      { label: 'Dedup', value: Math.max(0, 100 - duplication * 10), max: 100 },
    ];
  }

  private groupByCategory(findings: Finding[]): Array<{ title: string; content: string }> {
    const map = new Map<string, Finding[]>();
    for (const f of findings) {
      const key = f.category || 'general';
      const arr = map.get(key) ?? [];
      arr.push(f);
      map.set(key, arr);
    }
    return [...map.entries()].map(([category, items]) => ({
      title: category.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      content: items.map((f) => `- [${f.severity.toUpperCase()}] ${f.title}${f.file ? ` (${f.file}${f.line ? `:${f.line}` : ''})` : ''} — ${f.description}${f.suggestion ? `\n  Fix: ${f.suggestion}` : ''}`).join('\n'),
    }));
  }
}

function countBySeverity(findings: Finding[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of findings) out[f.severity] = (out[f.severity] ?? 0) + 1;
  return out;
}

function remediationAdvice(findings: Finding[]): string {
  const advice: string[] = [];
  const seen = new Set<string>();
  for (const f of findings) {
    if (!f.suggestion) continue;
    const key = f.category || f.title;
    if (seen.has(key)) continue;
    seen.add(key);
    advice.push(`**${f.title}** — ${f.suggestion}`);
  }
  return advice.length ? advice.join('\n\n') : 'No remediation items to list.';
}
