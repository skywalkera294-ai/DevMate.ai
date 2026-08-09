import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { IssuesService } from './issues.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('issues')
@UseGuards(JwtAuthGuard)
export class IssuesController {
  constructor(private readonly issues: IssuesService) {}

  @Get()
  list(@CurrentUser() user: { id: string }, @Query('projectId') projectId?: string) {
    return this.issues.list(user.id, projectId);
  }

  @Patch(':id')
  updateStatus(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() body: { status: 'OPEN' | 'CLOSED' },
  ) {
    return this.issues.updateStatus(user.id, id, body.status);
  }
}
