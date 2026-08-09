import { Body, Controller, Get, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatDto } from './dto/chat.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuditLogInterceptor } from '../common/interceptors/audit-log.interceptor';

@Controller('projects/:projectId/chat')
@UseGuards(JwtAuthGuard)
@UseInterceptors(AuditLogInterceptor)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post()
  send(@CurrentUser() user: { id: string }, @Param('projectId') projectId: string, @Body() dto: ChatDto) {
    return this.chat.send(user.id, projectId, dto);
  }

  @Get()
  history(@CurrentUser() user: { id: string }, @Param('projectId') projectId: string) {
    return this.chat.history(user.id, projectId);
  }
}
