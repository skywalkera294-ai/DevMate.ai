import {
  AlertTriangle,
  BookOpen,
  Bug,
  Code2,
  FileText,
  FlaskConical,
  Gauge,
  GitPullRequest,
  ListChecks,
  MessageSquare,
  Network,
  Rocket,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import type { ScanType, Severity } from '@devmate/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const SCAN_META: Record<ScanType, { label: string; icon: LucideIcon; blurb: string }> = {
  CODE_REVIEW: { label: 'Code Review', icon: Code2, blurb: 'Line-by-line review of every file' },
  README: { label: 'README', icon: FileText, blurb: 'Generate a polished README' },
  DOCUMENTATION: { label: 'Documentation', icon: BookOpen, blurb: 'Docstrings, comments and API docs' },
  TEST_GENERATOR: { label: 'Tests', icon: FlaskConical, blurb: 'Generate unit tests for your code' },
  BUG_DETECTOR: { label: 'Bug Detector', icon: Bug, blurb: 'Find infinite loops, off-by-ones and logic bugs' },
  SECURITY_SCANNER: { label: 'Security', icon: ShieldCheck, blurb: 'Injection, XSS, secrets and unsafe patterns' },
  PERFORMANCE: { label: 'Performance', icon: Gauge, blurb: 'O(n²) loops, N+1 queries and hot paths' },
  PR_REVIEW: { label: 'PR Review', icon: GitPullRequest, blurb: 'Review a pull request diff' },
  REPO_CHAT: { label: 'Repo Chat', icon: MessageSquare, blurb: 'Ask questions about the codebase' },
  ARCHITECTURE: { label: 'Architecture', icon: Network, blurb: 'Map modules and dependencies' },
  ISSUES: { label: 'Issues', icon: ListChecks, blurb: 'Extract actionable issues' },
  DEPLOYMENT: { label: 'Deployment', icon: Rocket, blurb: 'Dockerfile, CI and deploy configs' },
};

const SEVERITY_VARIANT: Record<Severity, 'destructive' | 'warning' | 'secondary' | 'outline'> = {
  critical: 'destructive',
  high: 'destructive',
  medium: 'warning',
  low: 'secondary',
  info: 'outline',
};

export function ScanIcon({ type, className }: { type: ScanType; className?: string }) {
  const Icon = SCAN_META[type]?.icon ?? Code2;
  return <Icon className={cn('h-4 w-4', className)} />;
}

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <Badge variant={SEVERITY_VARIANT[severity] ?? 'secondary'} className={cn('uppercase', className)}>
      {severity}
    </Badge>
  );
}

export function ScanStatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: 'default' | 'secondary' | 'success' | 'destructive'; text: string }> = {
    COMPLETED: { variant: 'success', text: 'Completed' },
    RUNNING: { variant: 'default', text: 'Running…' },
    PENDING: { variant: 'secondary', text: 'Queued' },
    FAILED: { variant: 'destructive', text: 'Failed' },
  };
  const s = map[status] ?? { variant: 'secondary' as const, text: status };
  return <Badge variant={s.variant}>{s.text}</Badge>;
}

export function SeverityDot({ severity, className }: { severity: Severity; className?: string }) {
  const color =
    severity === 'critical' || severity === 'high'
      ? 'bg-destructive'
      : severity === 'medium'
        ? 'bg-warning'
        : 'bg-success';
  return <span className={cn('inline-block h-2 w-2 rounded-full', color, className)} />;
}
