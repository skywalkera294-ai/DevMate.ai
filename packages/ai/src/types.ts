import type { ScanType, Severity } from '@devmate/shared';

export interface AnalyzerFile {
  path: string;
  content: string;
  language: string;
  size: number;
}

export interface AnalyzerContext {
  files: AnalyzerFile[];
  repoName?: string;
  repoUrl?: string;
  description?: string;
  branch?: string;
  baseBranch?: string;
  prTitle?: string;
  prBody?: string;
  options?: Record<string, unknown>;
}

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  file?: string;
  line?: number;
  code?: string;
  suggestion?: string;
  category?: string;
}

export interface Score {
  label: string;
  value: number;
  max: number;
}

export interface Section {
  title: string;
  content: string;
}

export interface ScanResult {
  summary: string;
  scores?: Score[];
  findings?: Finding[];
  sections?: Section[];
  markdown?: string;
  data?: Record<string, unknown>;
}

export interface AnalysisEngineOptions {
  provider?: 'offline' | 'openai-compatible';
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  embeddingModel?: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmProvider {
  /** Complete a chat conversation. Returns raw text. */
  complete(system: string, user: string, history?: ChatTurn[]): Promise<string>;
  /** Returns normalized embedding vector (empty array when unavailable). */
  embed(text: string): Promise<number[]>;
  readonly available: boolean;
}

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};
