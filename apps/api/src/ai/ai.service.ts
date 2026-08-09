import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalysisEngine, AnalyzerContext, ScanResult, ChatTurn } from '@devmate/ai';

export interface ChatAnswer {
  text: string;
  citations: Array<{ path: string; line: number; snippet: string; score: number }>;
  usedLlm: boolean;
}

@Injectable()
export class AiService {
  private readonly engine: AnalysisEngine;
  private readonly configuredProvider: 'offline' | 'openai-compatible';
  private readonly configuredModel: string;

  constructor(config: ConfigService) {
    this.configuredProvider = (config.get<string>('AI_PROVIDER') || 'offline') as 'offline' | 'openai-compatible';
    this.configuredModel = config.get<string>('AI_MODEL') || 'gpt-4o-mini';
    this.engine = new AnalysisEngine({
      provider: this.configuredProvider,
      model: this.configuredModel,
      apiKey: config.get<string>('OPENAI_API_KEY') || '',
      baseUrl: config.get<string>('OPENAI_BASE_URL') || 'https://api.openai.com/v1',
      embeddingModel: config.get<string>('EMBEDDING_MODEL') || 'text-embedding-3-small',
    });
  }

  get llmAvailable(): boolean {
    return this.engine.llmAvailable;
  }

  status() {
    return {
      provider: this.engine.llmAvailable ? this.configuredProvider : 'offline',
      model: this.engine.llmAvailable ? this.configuredModel : null,
      llmAvailable: this.engine.llmAvailable,
    };
  }

  run(type: string, ctx: AnalyzerContext): Promise<ScanResult> {
    return this.engine.run(type as never, ctx);
  }

  chat(query: string, ctx: AnalyzerContext, history: ChatTurn[] = []): Promise<ChatAnswer> {
    return this.engine.chat(query, ctx, history);
  }
}
