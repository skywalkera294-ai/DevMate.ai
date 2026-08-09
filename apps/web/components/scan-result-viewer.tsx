'use client';

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AlertTriangle, Bot, CheckCircle2, FileCode2, XCircle } from 'lucide-react';
import type { Finding, Score, Severity } from '@devmate/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScoreRing } from '@/components/score-ring';
import { SeverityBadge } from '@/components/scan-meta';

function severityRank(s: Severity): number {
  return { critical: 0, high: 1, medium: 2, low: 3, info: 4 }[s] ?? 5;
}

function FindingCard({ finding }: { finding: Finding }) {
  return (
    <Card className={finding.severity === 'critical' || finding.severity === 'high' ? 'border-destructive/40' : ''}>
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={finding.severity} />
          <span className="font-medium">{finding.title}</span>
          {finding.category && <Badge variant="outline">{finding.category}</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">{finding.description}</p>
        {(finding.file || finding.line) && (
          <p className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
            <FileCode2 className="h-3.5 w-3.5" />
            {finding.file}
            {finding.line ? `:${finding.line}` : ''}
          </p>
        )}
        {finding.code && (
          <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-3 font-mono text-xs">{finding.code}</pre>
        )}
        {finding.suggestion && (
          <div className="rounded-lg bg-primary/5 p-3 text-sm">
            <span className="font-medium text-primary">Suggestion: </span>
            <span className="text-muted-foreground">{finding.suggestion}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ScanResultViewer({ result }: { result: { summary: string; scores?: Score[]; findings?: Finding[]; sections?: Array<{ title: string; content: string }>; markdown?: string; data?: Record<string, unknown> } }) {
  const findings = useMemo(() => [...(result.findings ?? [])].sort((a, b) => severityRank(a.severity) - severityRank(b.severity)), [result.findings]);
  const critical = findings.filter((f) => f.severity === 'critical' || f.severity === 'high').length;
  const medium = findings.filter((f) => f.severity === 'medium').length;
  const low = findings.filter((f) => f.severity === 'low' || f.severity === 'info').length;
  const usedLlm = Boolean((result.data as { usedLlm?: boolean } | undefined)?.usedLlm);

  if (!result.summary && !result.markdown && findings.length === 0 && !result.sections?.length) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nothing to show.</p>;
  }

  return (
    <div className="space-y-6">
      {usedLlm && (
        <Badge variant="default" className="gap-1.5">
          <Bot className="h-3 w-3" /> AI-assisted review
        </Badge>
      )}
      {result.summary && (
        <Card>
          <CardContent className="flex items-start gap-3 p-5">
            {critical > 0 ? (
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            ) : findings.length > 0 ? (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            )}
            <div>
              <p className="text-sm leading-relaxed">{result.summary}</p>
              {findings.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span><span className="font-semibold text-destructive">{critical}</span> critical/high</span>
                  <span><span className="font-semibold text-warning">{medium}</span> medium</span>
                  <span><span className="font-semibold">{low}</span> low/info</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {result.scores && result.scores.length > 0 && (
        <div className="flex flex-wrap gap-4">
          {result.scores.map((s) => (
            <Card key={s.label} className="flex items-center gap-4 p-4">
              <ScoreRing value={s.value} max={s.max} size={72} stroke={6} />
              <div>
                <p className="text-sm font-medium">{s.label}</p>
                <p className="text-xs text-muted-foreground">
                  {s.value}/{s.max}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {result.markdown ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Report</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.markdown}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      ) : (
        result.sections &&
        result.sections.map((s) => (
          <Card key={s.title}>
            <CardHeader>
              <CardTitle className="text-base">{s.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{s.content}</ReactMarkdown>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {findings.length > 0 && (
        <section>
          <h3 className="mb-3 text-lg font-semibold">Findings ({findings.length})</h3>
          <div className="space-y-3">
            {findings.map((f) => (
              <FindingCard key={f.id} finding={f} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
