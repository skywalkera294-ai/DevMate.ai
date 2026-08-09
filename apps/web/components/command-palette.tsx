'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CornerDownLeft, FolderOpen, LayoutDashboard, Search, Settings, TriangleAlert, type LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import type { ProjectSummary } from '@devmate/shared';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Entry {
  id: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  action: () => void;
  group: string;
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const router = useRouter();

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<ProjectSummary[]>('/projects'),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!open) {
      setQuery('');
      setIndex(0);
    }
  }, [open]);

  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = [
      { id: 'dash', title: 'Dashboard', subtitle: 'Overview', icon: LayoutDashboard, group: 'Navigate', action: () => router.push('/dashboard') },
      { id: 'proj', title: 'Projects', subtitle: 'All projects', icon: FolderOpen, group: 'Navigate', action: () => router.push('/projects') },
      { id: 'iss', title: 'Issues', subtitle: 'Track issues', icon: TriangleAlert, group: 'Navigate', action: () => router.push('/issues') },
      { id: 'set', title: 'Settings', subtitle: 'Profile, plan & billing', icon: Settings, group: 'Navigate', action: () => router.push('/settings') },
      ...(projects ?? []).map((p) => ({
        id: p.id,
        title: p.name,
        subtitle: `${p.fileCount} files · ${p.linesOfCode.toLocaleString()} LOC`,
        icon: FolderOpen,
        group: 'Projects',
        action: () => router.push(`/projects/${p.id}`),
      })),
    ];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((e) => e.title.toLowerCase().includes(q) || e.subtitle.toLowerCase().includes(q));
  }, [query, projects, router]);

  const navigate = useCallback(() => {
    const e = entries[index];
    if (!e) return;
    e.action();
    onOpenChange(false);
  }, [entries, index, onOpenChange]);

  useEffect(() => setIndex(0), [entries]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, entries.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      navigate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[18%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 sm:rounded-xl" hideClose>
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a project or page…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">Esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2 scrollbar-thin">
          {entries.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">No matches</p>}
          {entries.map((e, i) => {
            const showGroup = i === 0 || entries[i - 1]!.group !== e.group;
            const Icon = e.icon;
            return (
              <div key={e.id}>
                {showGroup && <p className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{e.group}</p>}
                <button
                  onMouseEnter={() => setIndex(i)}
                  onClick={navigate}
                  className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm ${i === index ? 'bg-accent text-accent-foreground' : ''}`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">
                    <span className="block font-medium">{e.title}</span>
                    <span className="block text-xs text-muted-foreground">{e.subtitle}</span>
                  </span>
                  {i === index && <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
