import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IssuesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ownerId: string, projectId?: string) {
    return this.prisma.issue.findMany({
      where: { ownerId, ...(projectId ? { projectId } : {}) },
      orderBy: { severity: 'asc' },
      take: 100,
      include: { project: { select: { id: true, name: true } } },
    }).then((rows) =>
      rows.map((i) => ({
        id: i.id,
        title: i.title,
        type: i.type,
        severity: i.severity,
        status: i.status,
        projectId: i.projectId,
        projectName: i.project.name,
        createdAt: i.createdAt.toISOString(),
      })),
    );
  }

  async updateStatus(ownerId: string, issueId: string, status: 'OPEN' | 'CLOSED') {
    const issue = await this.prisma.issue.findFirst({ where: { id: issueId, ownerId } });
    if (!issue) throw new NotFoundException('Issue not found');
    return this.prisma.issue.update({ where: { id: issueId }, data: { status } });
  }
}
