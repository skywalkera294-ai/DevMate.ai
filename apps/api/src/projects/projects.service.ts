import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { languageFromPath, type Language } from '@devmate/shared';
import { chunkFiles } from '@devmate/ai';
import { PrismaService } from '../prisma/prisma.service';
import { AddFileDto, CreateProjectDto, ImportRepoDto, UpdateProjectDto } from './dto/projects.dto';
import { GitHubService } from '../github/github.service';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly github: GitHubService,
  ) {}

  async create(ownerId: string, dto: CreateProjectDto) {
    const count = await this.prisma.project.count({ where: { ownerId } });
    if (count >= 50) throw new BadRequestException('Project limit reached (50). Delete an old project first.');
    return this.prisma.project.create({ data: { ownerId, ...dto } });
  }

  async list(ownerId: string) {
    const projects = await this.prisma.project.findMany({
      where: { ownerId },
      orderBy: { updatedAt: 'desc' },
      include: {
        files: { select: { path: true, language: true, size: true, uploadedAt: true } },
        scans: { select: { id: true, type: true, status: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 3 },
        issues: { select: { id: true, status: true }, where: { status: 'OPEN' } },
      },
    });
    return projects.map((p) => this.summarize(p));
  }

  async get(ownerId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, ownerId },
      include: {
        files: { orderBy: { path: 'asc' } },
        issues: { orderBy: { createdAt: 'desc' }, take: 50 },
        scans: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    return this.summarize(project);
  }

  async update(ownerId: string, id: string, dto: UpdateProjectDto) {
    await this.ensureOwner(ownerId, id);
    return this.prisma.project.update({ where: { id }, data: dto });
  }

  async remove(ownerId: string, id: string) {
    await this.ensureOwner(ownerId, id);
    await this.prisma.project.delete({ where: { id } });
    return { ok: true };
  }

  async addTextFile(ownerId: string, projectId: string, dto: AddFileDto) {
    await this.ensureOwner(ownerId, projectId);
    if (dto.content.length > 1_000_000) {
      throw new BadRequestException('File too large (max 1MB of text per file).');
    }
    const existing = await this.prisma.projectFile.findUnique({
      where: { projectId_path: { projectId, path: dto.path } },
    });
    if (existing) {
      await this.prisma.projectFile.update({
        where: { id: existing.id },
        data: { content: dto.content, language: languageFromPath(dto.path), size: Buffer.byteLength(dto.content) },
      });
    } else {
      await this.prisma.projectFile.create({
        data: {
          projectId,
          path: dto.path,
          content: dto.content,
          language: languageFromPath(dto.path),
          size: Buffer.byteLength(dto.content),
        },
      });
    }
    await this.reindexChunks(projectId);
    return { ok: true, path: dto.path };
  }

  async uploadFiles(ownerId: string, projectId: string, files: Array<Express.Multer.File>) {
    await this.ensureOwner(ownerId, projectId);
    if (!files.length) throw new BadRequestException('No files received');
    const maxFiles = 2000;
    const current = await this.prisma.projectFile.count({ where: { projectId } });
    if (current + files.length > maxFiles) {
      throw new BadRequestException(`Too many files (max ${maxFiles})`);
    }
    const added: string[] = [];
    for (const f of files) {
      const content = f.buffer.toString('utf8');
      const existing = await this.prisma.projectFile.findUnique({
        where: { projectId_path: { projectId, path: f.originalname } },
      });
      if (existing) {
        await this.prisma.projectFile.update({
          where: { id: existing.id },
          data: { content, language: languageFromPath(f.originalname), size: content.length },
        });
      } else {
        await this.prisma.projectFile.create({
          data: {
            projectId,
            path: f.originalname,
            content,
            language: languageFromPath(f.originalname),
            size: content.length,
          },
        });
      }
      added.push(f.originalname);
    }
    await this.reindexChunks(projectId);
    return { ok: true, added };
  }

  async deleteFile(ownerId: string, projectId: string, path: string) {
    await this.ensureOwner(ownerId, projectId);
    await this.prisma.projectFile.deleteMany({ where: { projectId, path } });
    await this.reindexChunks(projectId);
    return { ok: true };
  }

  async importGithub(ownerId: string, dto: ImportRepoDto) {
    const files = await this.github.fetchRepoFiles(dto.repo, dto.branch);
    if (files.length === 0) {
      throw new BadRequestException('No files imported. Configure GITHUB_TOKEN or check the repo name.');
    }
    const project = await this.create(ownerId, {
      name: dto.repo.split('/').pop() ?? dto.repo,
      repoUrl: `https://github.com/${dto.repo}`,
      description: `Imported from GitHub (${dto.branch ?? 'default'})`,
    });
    for (const f of files) {
      if (f.size > 1_000_000) continue;
      await this.prisma.projectFile.create({
        data: {
          projectId: project.id,
          path: f.path,
          content: f.content,
          language: languageFromPath(f.path),
          size: Buffer.byteLength(f.content),
        },
      });
    }
    await this.reindexChunks(project.id);
    return project;
  }

  async filesForAnalysis(projectId: string): Promise<Array<{ path: string; content: string; language: string; size: number }>> {
    const files = await this.prisma.projectFile.findMany({
      where: { projectId },
      select: { path: true, content: true, language: true, size: true },
    });
    return files.map((f) => ({ path: f.path, content: f.content, language: f.language, size: f.size }));
  }

  private async reindexChunks(projectId: string) {
    const files = await this.filesForAnalysis(projectId);
    const chunks = chunkFiles(files);
    await this.prisma.$transaction([
      this.prisma.repoChunk.deleteMany({ where: { projectId } }),
      ...chunks.map((c) =>
        this.prisma.repoChunk.create({
          data: {
            projectId,
            path: c.path,
            content: c.content,
            startLine: c.startLine,
            embedding: JSON.stringify(c.embedding),
          },
        }),
      ),
    ]);
  }

  private async ensureOwner(ownerId: string, projectId: string) {
    const p = await this.prisma.project.findFirst({ where: { id: projectId, ownerId } });
    if (!p) throw new NotFoundException('Project not found');
    return p;
  }

  private summarize(p: {
    id: string;
    name: string;
    description: string | null;
    repoUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
    files: Array<{ path: string; language: string; size: number; uploadedAt: Date }>;
    scans?: Array<{ id: string; type: string; status: string; createdAt: Date }>;
    issues?: Array<{ id: string; status: string }>;
  }) {
    const languages: Record<string, number> = {};
    let linesOfCode = 0;
    for (const f of p.files) {
      languages[f.language] = (languages[f.language] ?? 0) + 1;
      linesOfCode += Math.max(1, Math.round(f.size / 40));
    }
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      repoUrl: p.repoUrl,
      fileCount: p.files.length,
      linesOfCode,
      languages,
      openIssues: p.issues?.filter((i) => i.status === 'OPEN').length ?? 0,
      recentScans: (p.scans ?? []).map((s) => ({ id: s.id, type: s.type, status: s.status, createdAt: s.createdAt.toISOString() })),
      files: p.files.map((f) => ({ path: f.path, language: f.language, size: f.size })),
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}
