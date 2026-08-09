import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ProjectsService } from './projects.service';
import { AddFileDto, CreateProjectDto, ImportRepoDto, UpdateProjectDto } from './dto/projects.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuditLogInterceptor } from '../common/interceptors/audit-log.interceptor';

@Controller('projects')
@UseGuards(JwtAuthGuard)
@UseInterceptors(AuditLogInterceptor)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateProjectDto) {
    return this.projects.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: { id: string }) {
    return this.projects.list(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.projects.get(user.id, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: { id: string }, @Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.projects.remove(user.id, id);
  }

  @Post(':id/files/text')
  addText(@CurrentUser() user: { id: string }, @Param('id') id: string, @Body() dto: AddFileDto) {
    return this.projects.addTextFile(user.id, id, dto);
  }

  @Post(':id/files')
  @UseInterceptors(FilesInterceptor('files', 100))
  upload(@CurrentUser() user: { id: string }, @Param('id') id: string, @UploadedFiles() files: Express.Multer.File[]) {
    return this.projects.uploadFiles(user.id, id, files);
  }

  @Delete(':id/files')
  deleteFile(@CurrentUser() user: { id: string }, @Param('id') id: string, @Body() body: { path: string }) {
    if (!body?.path) throw new BadRequestException('path is required');
    return this.projects.deleteFile(user.id, id, body.path);
  }

  @Post('import/github')
  import(@CurrentUser() user: { id: string }, @Body() dto: ImportRepoDto) {
    return this.projects.importGithub(user.id, dto);
  }
}
