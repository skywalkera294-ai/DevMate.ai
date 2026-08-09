import { Body, Controller, Delete, Get, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { BillingService } from './billing.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuditLogInterceptor } from '../common/interceptors/audit-log.interceptor';
import { Public } from '../common/decorators/public.decorator';

@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Public()
  @Get('plans')
  plans() {
    return this.billing.plans();
  }

  @Get()
  current(@CurrentUser() user: { id: string }) {
    return this.billing.current(user.id);
  }

  @UseInterceptors(AuditLogInterceptor)
  @Post('upgrade')
  upgrade(@CurrentUser() user: { id: string }, @Body() body: { plan: string }) {
    return this.billing.upgrade(user.id, body.plan);
  }

  @UseInterceptors(AuditLogInterceptor)
  @Delete()
  cancel(@CurrentUser() user: { id: string }) {
    return this.billing.cancel(user.id);
  }
}
