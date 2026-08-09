import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PLAN_LIMITS } from '../common/constants';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { ProjectsService } from '../projects/projects.service';
import { CreateScanDto } from './dto/scans.dto';

@Injectable()
export class ScansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly projects: ProjectsService,
  ) {}

  async create(ownerId: string, projectId: string, dto: CreateScanDto) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, ownerId } });
    if (!project) throw new NotFoundException('Project not found');

    const user = await this.prisma.user.findUnique({ where: { id: ownerId } });
    if (!user) throw new NotFoundException('User not found');

    this.enforceQuota(user);

    if (dto.type === 'REPO_CHAT') {
      throw new BadRequestException('REPO_CHAT requires a query; use POST /projects/:id/chat');
    }

    const scan = await this.prisma.scan.create({
      data: { projectId, ownerId, type: dto.type, status: 'RUNNING' },
    });

    try {
      const files = await this.projects.filesForAnalysis(projectId);
      if (files.length === 0) throw new BadRequestException('Project has no files to analyze');
      const result = await this.ai.run(dto.type, {
        files,
        repoName: project.name,
        repoUrl: project.repoUrl ?? undefined,
        description: project.description ?? undefined,
      });

      if (dto.type === 'ISSUES') {
        await this.persistIssues(ownerId, projectId, result);
      }

      const finished = await this.prisma.scan.update({
        where: { id: scan.id },
        data: { status: 'COMPLETED', result: JSON.stringify(result), finishedAt: new Date() },
      });

      await this.prisma.user.update({
        where: { id: ownerId },
        data: { scanCountDay: { increment: 1 }, lastScanDate: today() },
      });

      return this.serialize(finished);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Scan failed';
      const failed = await this.prisma.scan.update({
        where: { id: scan.id },
        data: { status: 'FAILED', error: message, finishedAt: new Date() },
      });
      return this.serialize(failed);
    }
  }

  async list(ownerId: string, projectId: string) {
    return this.prisma.scan.findMany({
      where: { ownerId, projectId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, type: true, status: true, error: true, createdAt: true, finishedAt: true },
    }).then((rows) =>
      rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null })),
    );
  }

  async get(ownerId: string, scanId: string) {
    const scan = await this.prisma.scan.findFirst({ where: { id: scanId, ownerId } });
    if (!scan) throw new NotFoundException('Scan not found');
    return this.serialize(scan);
  }

  private serialize(scan: {
    id: string;
    projectId: string;
    type: string;
    status: string;
    result: string | null;
    error: string | null;
    createdAt: Date;
    finishedAt: Date | null;
  }) {
    return {
      id: scan.id,
      projectId: scan.projectId,
      type: scan.type,
      status: scan.status,
      error: scan.error,
      createdAt: scan.createdAt.toISOString(),
      finishedAt: scan.finishedAt?.toISOString() ?? null,
      result: scan.result ? JSON.parse(scan.result) : null,
    };
  }

  private enforceQuota(user: { id: string; plan: string; scanCountDay: number; lastScanDate: string | null }) {
    const limits = PLAN_LIMITS[user.plan] ?? PLAN_LIMITS.free;
    const usedToday = user.lastScanDate === today() ? user.scanCountDay : 0;
    if (usedToday >= limits.scansPerDay) {
      throw new HttpException(
        `Daily scan limit reached (${limits.scansPerDay}/day on the ${user.plan} plan). Upgrade for unlimited scans.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async persistIssues(ownerId: string, projectId: string, result: { data?: Record<string, unknown> }) {
    const issues = (result.data?.issues ?? []) as Array<{ title: string; type: string; severity: string }>;
    for (const issue of issues.slice(0, 30)) {
      const exists = await this.prisma.issue.findFirst({
        where: { projectId, title: issue.title, status: 'OPEN' },
      });
      if (exists) continue;
      await this.prisma.issue.create({
        data: { projectId, ownerId, title: issue.title, type: issue.type, severity: issue.severity },
      });
    }
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
