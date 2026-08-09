import { Injectable } from '@nestjs/common';
import type { DashboardStats, ScanType } from '@devmate/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PLAN_LIMITS } from '../common/constants';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async stats(ownerId: string): Promise<DashboardStats> {
    const [projects, scanCount, openIssues, recentScans, recentProjects, logs, securityScan, perfScan, reviewScan] =
      await Promise.all([
        this.prisma.project.findMany({
          where: { ownerId },
          orderBy: { updatedAt: 'desc' },
          take: 6,
          include: { files: { select: { size: true, language: true } } },
        }),
        this.prisma.scan.count({ where: { ownerId } }),
        this.prisma.issue.count({ where: { ownerId, status: 'OPEN' } }),
        this.prisma.scan.findMany({
          where: { ownerId },
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: { id: true, type: true, status: true, error: true, createdAt: true },
        }),
        this.prisma.project.findMany({
          where: { ownerId },
          orderBy: { createdAt: 'desc' },
          take: 4,
          select: { id: true, name: true, description: true, repoUrl: true, createdAt: true },
        }),
        this.prisma.auditLog.findMany({
          where: { ownerId },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, action: true, createdAt: true },
        }),
        this.latestScore(ownerId, 'SECURITY_SCANNER'),
        this.latestScore(ownerId, 'PERFORMANCE'),
        this.latestScore(ownerId, 'CODE_REVIEW'),
      ]);

    const user = await this.prisma.user.findUnique({ where: { id: ownerId } });
    const limits = PLAN_LIMITS[user?.plan ?? 'free'];
    const usedToday = user?.lastScanDate === today() ? user?.scanCountDay ?? 0 : 0;

    const languageCount: Record<string, number> = {};
    let linesOfCode = 0;
    for (const p of projects) {
      for (const f of p.files) {
        languageCount[f.language] = (languageCount[f.language] ?? 0) + 1;
        linesOfCode += Math.max(1, Math.round(f.size / 40));
      }
    }

    const docsCoverage = await this.docsCoverage(ownerId);

    return {
      projectCount: projects.length,
      scanCount,
      securityScore: securityScan ?? null,
      performanceScore: perfScan ?? null,
      codeQualityScore: reviewScan ?? null,
      docsCoverage,
      openIssues,
      scansUsedToday: usedToday,
      plan: (user?.plan ?? 'free') as DashboardStats['plan'],
      recentScans: recentScans.map((s) => ({
        id: s.id,
        type: s.type as ScanType,
        status: s.status as DashboardStats['recentScans'][number]['status'],
        summary: s.error ?? null,
        createdAt: s.createdAt.toISOString(),
      })),
      recentProjects: recentProjects.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        repoUrl: p.repoUrl,
        fileCount: 0,
        linesOfCode,
        languages: languageCount,
        createdAt: p.createdAt.toISOString(),
      })),
      activity: logs.map((l) => ({
        id: l.id,
        text: l.action,
        createdAt: l.createdAt.toISOString(),
      })),
    };
  }

  private async latestScore(ownerId: string, type: string): Promise<number | null> {
    const scan = await this.prisma.scan.findFirst({
      where: { ownerId, type, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
      select: { result: true },
    });
    if (!scan?.result) return null;
    try {
      const result = JSON.parse(scan.result) as { scores?: Array<{ label: string; value: number; max: number }> };
      const score = result.scores?.[0];
      return score && score.max > 0 ? score.value : null;
    } catch {
      return null;
    }
  }

  private async docsCoverage(ownerId: string): Promise<number> {
    const files = await this.prisma.projectFile.findMany({
      where: { project: { ownerId } },
      select: { path: true },
      take: 1000,
    });
    if (files.length === 0) return 0;
    const documented = files.filter((f) => {
      if (/\.(md|mdx)$/.test(f.path)) return true;
      return /readme|docs|documentation/i.test(f.path);
    }).length;
    return Math.round((documented / files.length) * 100);
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
