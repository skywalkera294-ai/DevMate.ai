import { Controller, Get, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { ScansService } from './scans.service';
import { CreateScanDto } from './dto/scans.dto';
import { Body } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuditLogInterceptor } from '../common/interceptors/audit-log.interceptor';

@Controller('projects/:projectId/scans')
@UseGuards(JwtAuthGuard)
@UseInterceptors(AuditLogInterceptor)
export class ScansController {
  constructor(private readonly scans: ScansService) {}

  @Post()
  create(
    @CurrentUser() user: { id: string },
    @Param('projectId') projectId: string,
    @Body() dto: CreateScanDto,
  ) {
    return this.scans.create(user.id, projectId, dto);
  }

  @Get()
  list(@CurrentUser() user: { id: string }, @Param('projectId') projectId: string) {
    return this.scans.list(user.id, projectId);
  }

  @Get(':scanId')
  get(@CurrentUser() user: { id: string }, @Param('scanId') scanId: string) {
    return this.scans.get(user.id, scanId);
  }
}
