'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  FileCode2,
  FolderOpen,
  FolderPlus,
  ScanLine,
  TriangleAlert,
  Zap,
} from 'lucide-react';
import type { DashboardStats } from '@devmate/shared';
import { api } from '@/lib/api';
import { formatRelative } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { ScoreRing } from '@/components/score-ring';
import { ProjectCard } from '@/components/project-card';
import { ScanStatusBadge, ScanIcon } from '@/components/scan-meta';

const SCAN_LIMITS: Record<string, number> = { free: 3, pro: 1000, team: 10000 };

export default function DashboardPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<DashboardStats>('/dashboard'),
    refetchInterval: 15_000,
  });

  const limit = useMemo(() => (data ? SCAN_LIMITS[data.plan] ?? 3 : 3), [data]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 rounded-xl lg:col-span-2" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <TriangleAlert className="h-8 w-8 text-destructive" />
        <p className="text-muted-foreground">Could not load dashboard.</p>
        <Button variant="outline" onClick={() => refetch()}>Try again</Button>
      </div>
    );
  }

  const scoreCards = [
    { label: 'Security', value: data.securityScore },
    { label: 'Performance', value: data.performanceScore },
    { label: 'Code quality', value: data.codeQualityScore },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Your workspace at a glance</p>
        </div>
        <Link href="/projects">
          <Button>
            <FolderPlus className="h-4 w-4" /> New project
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FolderOpen className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{data.projectCount}</div>
              <div className="text-xs text-muted-foreground">Projects</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-sky-500/10 text-sky-500">
              <ScanLine className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{data.scanCount}</div>
              <div className="text-xs text-muted-foreground">Total scans</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-warning/10 text-warning">
              <TriangleAlert className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{data.openIssues}</div>
              <div className="text-xs text-muted-foreground">Open issues</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-success/10 text-success">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{data.scansUsedToday}</div>
              <div className="text-xs text-muted-foreground">Scans used today</div>
              <Progress value={(data.scansUsedToday / limit) * 100} className="mt-1.5 h-1.5 w-28" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Quality scores</CardTitle>
            <span className="text-xs text-muted-foreground">From the latest scan of each type</span>
          </CardHeader>
          <CardContent>
            {scoreCards.some((s) => s.value != null) ? (
              <div className="grid gap-4 sm:grid-cols-3">
                {scoreCards.map((s) => (
                  <div key={s.label} className="flex flex-col items-center gap-2 rounded-lg border border-border p-4">
                    <ScoreRing value={s.value ?? 0} size={88} stroke={7} label={s.label} />
                    {s.value == null && <p className="text-[11px] text-muted-foreground">No scan yet</p>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <FileCode2 className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Run your first scan to see quality scores.</p>
                <Link href="/projects">
                  <Button size="sm">Open projects</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {data.activity.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No activity yet</p>}
            {data.activity.map((a) => (
              <div key={a.id} className="flex items-start gap-3 rounded-lg p-2 text-sm hover:bg-accent/50">
                <Activity className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate">{a.text}</p>
                  <p className="text-xs text-muted-foreground">{formatRelative(a.createdAt)}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent projects</h2>
          <Link href="/projects" className="flex items-center gap-1 text-sm text-primary hover:underline">
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {data.recentProjects.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <FolderOpen className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No projects yet — create your first one.</p>
              <Link href="/projects">
                <Button>Create project</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.recentProjects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </section>

      {data.recentScans.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Recent scans</h2>
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {data.recentScans.map((s) => {
                const meta = ScanStatusBadge({ status: s.status });
                return (
                  <div key={s.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <ScanIcon type={s.type} className="text-muted-foreground" />
                    <span className="flex-1 font-medium">{s.type.replace(/_/g, ' ')}</span>
                    {meta}
                    <span className="text-xs text-muted-foreground">{formatRelative(s.createdAt)}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
