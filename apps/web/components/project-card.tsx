'use client';

import Link from 'next/link';
import { FileCode2, FolderGit2 } from 'lucide-react';
import type { ProjectSummary } from '@devmate/shared';
import { cn, formatRelative } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const PALETTE = [
  'from-indigo-500 to-sky-500',
  'from-violet-500 to-fuchsia-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
  'from-cyan-500 to-blue-500',
];

function paletteFor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

export function ProjectCard({ project, className }: { project: ProjectSummary; className?: string }) {
  const topLanguage = Object.entries(project.languages).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'other';
  const openIssues = (project as ProjectSummary & { openIssues?: number }).openIssues ?? 0;

  return (
    <Link href={`/projects/${project.id}`}>
      <Card className={cn('group h-full transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5', className)}>
        <CardContent className="flex h-full flex-col gap-3 p-5">
          <div className="flex items-start justify-between">
            <div
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br text-lg font-bold text-white shadow',
                paletteFor(project.id),
              )}
            >
              {project.name.slice(0, 2).toUpperCase()}
            </div>
            {openIssues > 0 && <Badge variant="warning">{openIssues} open</Badge>}
          </div>
          <div className="flex-1">
            <h3 className="truncate font-semibold group-hover:text-primary">{project.name}</h3>
            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{project.description || 'No description'}</p>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <FileCode2 className="h-3.5 w-3.5" />
              {project.fileCount} files · {project.linesOfCode.toLocaleString()} LOC
            </span>
            <span>{formatRelative(project.createdAt)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="normal-case">
              {topLanguage}
            </Badge>
            {project.repoUrl && <FolderGit2 className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
