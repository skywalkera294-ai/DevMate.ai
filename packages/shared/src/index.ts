export type Language =
  | 'python'
  | 'java'
  | 'javascript'
  | 'typescript'
  | 'c'
  | 'cpp'
  | 'csharp'
  | 'go'
  | 'rust'
  | 'php'
  | 'kotlin'
  | 'swift'
  | 'other';

export type ScanType =
  | 'CODE_REVIEW'
  | 'README'
  | 'DOCUMENTATION'
  | 'TEST_GENERATOR'
  | 'BUG_DETECTOR'
  | 'SECURITY_SCANNER'
  | 'PERFORMANCE'
  | 'PR_REVIEW'
  | 'REPO_CHAT'
  | 'ARCHITECTURE'
  | 'ISSUES'
  | 'DEPLOYMENT';

export type ScanStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type Plan = 'free' | 'pro' | 'team';

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

export interface ScanResult {
  summary: string;
  scores?: Score[];
  findings?: Finding[];
  sections?: Array<{ title: string; content: string }>;
  markdown?: string;
  data?: Record<string, unknown>;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  repoUrl: string | null;
  fileCount: number;
  linesOfCode: number;
  languages: Record<string, number>;
  createdAt: string;
  updatedAt?: string;
  openIssues?: number;
  recentScans?: Array<{ id: string; type: ScanType; status: ScanStatus; createdAt: string }>;
  files?: Array<{ path: string; language: string; size: number }>;
}

export interface ScanSummary {
  id: string;
  type: ScanType;
  status: ScanStatus;
  summary: string | null;
  createdAt: string;
}

export interface UserSummary {
  id: string;
  email: string;
  name: string | null;
  plan: Plan;
  avatarUrl: string | null;
}

export interface DashboardStats {
  projectCount: number;
  scanCount: number;
  securityScore: number | null;
  performanceScore: number | null;
  codeQualityScore: number | null;
  docsCoverage: number | null;
  openIssues: number;
  scansUsedToday: number;
  plan: Plan;
  recentScans: ScanSummary[];
  recentProjects: ProjectSummary[];
  activity: Array<{ id: string; text: string; createdAt: string }>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: UserSummary;
}

export interface ApiError {
  statusCode: number;
  message: string | string[];
  error?: string;
}

export const SCAN_TYPES: ScanType[] = [
  'CODE_REVIEW',
  'README',
  'DOCUMENTATION',
  'TEST_GENERATOR',
  'BUG_DETECTOR',
  'SECURITY_SCANNER',
  'PERFORMANCE',
  'PR_REVIEW',
  'REPO_CHAT',
  'ARCHITECTURE',
  'ISSUES',
  'DEPLOYMENT',
];

export const LANGUAGE_EXTENSIONS: Record<string, Language> = {
  py: 'python',
  java: 'java',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cc: 'cpp',
  cs: 'csharp',
  go: 'go',
  rs: 'rust',
  php: 'php',
  kt: 'kotlin',
  kts: 'kotlin',
  swift: 'swift',
  md: 'other',
  json: 'other',
  yml: 'other',
  yaml: 'other',
  toml: 'other',
  html: 'other',
  css: 'other',
  sql: 'other',
  sh: 'other',
  dockerfile: 'other',
};

export function languageFromPath(path: string): Language {
  const lower = path.toLowerCase();
  const name = lower.split('/').pop() ?? '';
  if (name === 'dockerfile') return 'other';
  const ext = name.includes('.') ? name.split('.').pop() ?? '' : '';
  return LANGUAGE_EXTENSIONS[ext] ?? 'other';
}
