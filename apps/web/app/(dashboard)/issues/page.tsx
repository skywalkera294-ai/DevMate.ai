'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Check, Loader2, TriangleAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatRelative } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { SeverityDot } from '@/components/scan-meta';

interface Issue {
  id: string;
  title: string;
  type: string | null;
  severity: string;
  status: 'OPEN' | 'CLOSED';
  projectId: string;
  projectName: string;
  createdAt: string;
}

export default function IssuesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['issues'],
    queryFn: () => api<Issue[]>('/issues'),
  });

  async function toggle(issue: Issue) {
    const next = issue.status === 'OPEN' ? 'CLOSED' : 'OPEN';
    try {
      await api(`/issues/${issue.id}`, { method: 'PATCH', body: { status: next } });
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(`Issue ${next.toLowerCase()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  }

  const open = (data ?? []).filter((i) => i.status === 'OPEN');
  const closed = (data ?? []).filter((i) => i.status === 'CLOSED');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Issues</h1>
        <p className="text-sm text-muted-foreground">Found by AI scans, ready for you to act on</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-4 py-24 text-center">
          <TriangleAlert className="h-8 w-8 text-destructive" />
          <Button variant="outline" onClick={() => refetch()}>Try again</Button>
        </div>
      ) : data && data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-20 text-center">
            <Check className="h-10 w-10 text-success" />
            <p className="font-semibold">All clear!</p>
            <p className="text-sm text-muted-foreground">Run an &quot;Issues&quot; scan on a project to populate this list.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-lg font-semibold">Open ({open.length})</h2>
            <div className="space-y-2">
              {open.map((i) => (
                <Card key={i.id}>
                  <CardContent className="flex items-center gap-3 p-4">
                    <SeverityDot severity={i.severity as never} className="h-2.5 w-2.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{i.title}</p>
                      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <button
                          className="text-primary hover:underline"
                          onClick={() => router.push(`/projects/${i.projectId}`)}
                        >
                          {i.projectName}
                        </button>
                        {i.type && <span className="rounded bg-muted px-1.5 py-0.5">{i.type}</span>}
                        <span className="uppercase">{i.severity}</span>
                        <span>· {formatRelative(i.createdAt)}</span>
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => void toggle(i)}>
                      <Check className="h-4 w-4" /> Done
                    </Button>
                  </CardContent>
                </Card>
              ))}
              {open.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No open issues. Great job!</p>
              )}
            </div>
          </section>

          {closed.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold text-muted-foreground">Closed ({closed.length})</h2>
              <div className="space-y-2 opacity-70">
                {closed.map((i) => (
                  <Card key={i.id}>
                    <CardContent className="flex items-center gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium line-through">{i.title}</p>
                        <p className="text-xs text-muted-foreground">{i.projectName}</p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => void toggle(i)}>
                        <X className="h-4 w-4" /> Reopen
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
