import { Controller, Get } from '@nestjs/common';
import { AiService } from './ai.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Public()
  @Get('status')
  status() {
    return this.ai.status();
  }
}
