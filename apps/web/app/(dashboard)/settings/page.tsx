'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import type { UserSummary } from '@devmate/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface PlanInfo {
  id: string;
  name: string;
  price: number;
  interval: string;
  tagline: string;
  features: string[];
  limits: { scansPerDay: number; maxFiles: number };
}

interface BillingCurrent {
  plan: string;
  planDetails: PlanInfo | null;
  subscription: { id: string; provider: string; status: string; currentPeriodEnd: string | null } | null;
  limits: { scansPerDay: number; maxFiles: number };
}

export default function SettingsPage() {
  const { user, setAuth } = useAuth();
  const queryClient = useQueryClient();

  const { data: billing, isLoading } = useQuery({
    queryKey: ['billing'],
    queryFn: () => api<BillingCurrent>('/billing'),
  });

  const { data: plans } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api<PlanInfo[]>('/billing/plans'),
  });

  const { data: dashboard } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<{ scansUsedToday: number }>('/dashboard'),
  });

  async function upgrade(plan: string) {
    try {
      const res = await api<{ ok: boolean; plan: string; message: string }>('/billing/upgrade', {
        method: 'POST',
        body: { plan },
      });
      toast.success(res.message);
      queryClient.invalidateQueries({ queryKey: ['billing'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      const me = await api<UserSummary>('/auth/me');
      if (user) setAuth({ token: localStorage.getItem('devmate_token') ?? '', user: me });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upgrade failed');
    }
  }

  async function cancel() {
    try {
      const res = await api<{ ok: boolean; message: string }>('/billing', { method: 'DELETE' });
      toast.success(res.message);
      queryClient.invalidateQueries({ queryKey: ['billing'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cancel failed');
    }
  }

  if (isLoading || !billing) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 rounded" />
        <Skeleton className="h-28 rounded-xl" />
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const plan = billing.plan;
  const limit = billing.limits?.scansPerDay ?? 3;
  const used = dashboard?.scansUsedToday ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Plan, billing and usage</p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold capitalize">{plan} plan</h2>
              {billing.planDetails && <Badge variant="outline">${billing.planDetails.price}/month</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{billing.planDetails?.tagline}</p>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Scans today:</span>
              <span className="font-medium">
                {used} / {limit}
              </span>
              <Progress value={(used / limit) * 100} className="w-32" />
            </div>
            {billing.subscription && (
              <p className="mt-2 text-xs text-muted-foreground">
                {billing.subscription.status} · renews {billing.subscription.currentPeriodEnd ? new Date(billing.subscription.currentPeriodEnd).toLocaleDateString() : '—'}
              </p>
            )}
          </div>
          {plan !== 'free' && (
            <Button variant="outline" className="text-destructive hover:bg-destructive/10" onClick={() => void cancel()}>
              Cancel subscription
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {(plans ?? []).map((p) => {
          const current = p.id === plan;
          return (
            <Card key={p.id} className={cn(current && 'border-primary shadow-lg shadow-primary/10')}>
              <CardContent className="flex h-full flex-col p-6">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{p.name}</span>
                  {current && <Badge>Current</Badge>}
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">${p.price}</span>
                  <span className="text-sm text-muted-foreground">/month</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>
                <ul className="mt-5 flex-1 space-y-2 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary" /> {f}
                    </li>
                  ))}
                </ul>
                {!current && (
                  <Button className="mt-6 w-full" variant={p.price === 0 ? 'outline' : 'default'} onClick={() => void upgrade(p.id)} disabled={p.id === 'free'}>
                    {p.price === 0 ? 'Downgrade to Free' : `Upgrade to ${p.name}`}
                    {plan === p.id && <Loader2 className="h-4 w-4 animate-spin" />}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
