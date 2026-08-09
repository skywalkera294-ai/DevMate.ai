import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { ProjectsService } from '../projects/projects.service';
import { ChatDto } from './dto/chat.dto';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly projects: ProjectsService,
  ) {}

  async send(ownerId: string, projectId: string, dto: ChatDto) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, ownerId } });
    if (!project) throw new NotFoundException('Project not found');

    const files = await this.projects.filesForAnalysis(projectId);
    if (files.length === 0) throw new NotFoundException('Project has no files to search');

    const userMsg = await this.prisma.chatMessage.create({
      data: { projectId, ownerId, role: 'user', content: dto.query },
    });

    const recent = await this.prisma.chatMessage.findMany({
      where: { ownerId, projectId },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { role: true, content: true },
    });

    const answer = await this.ai.chat(
      dto.query,
      {
        files,
        repoName: project.name,
        repoUrl: project.repoUrl ?? undefined,
      },
      recent
        .slice()
        .reverse()
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    );

    const assistantMsg = await this.prisma.chatMessage.create({
      data: { projectId, ownerId, role: 'assistant', content: answer.text },
    });

    return {
      answer,
      messages: [
        { id: userMsg.id, role: 'user', content: userMsg.content, createdAt: userMsg.createdAt.toISOString() },
        { id: assistantMsg.id, role: 'assistant', content: assistantMsg.content, createdAt: assistantMsg.createdAt.toISOString() },
      ],
    };
  }

  async history(ownerId: string, projectId: string) {
    return this.prisma.chatMessage.findMany({
      where: { ownerId, projectId },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: { id: true, role: true, content: true, createdAt: true },
    }).then((rows) => rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
  }
}
