export const IS_PUBLIC_KEY = 'isPublic';
export const JWT_EXPIRES_IN = '7d';

export const PLAN_LIMITS: Record<
  string,
  { scansPerDay: number; maxFiles: number; maxFileSizeMb: number; features: string[] }
> = {
  free: {
    scansPerDay: 3,
    maxFiles: 200,
    maxFileSizeMb: 5,
    features: ['Code review', 'README generator', 'Bug detector', 'Docs generator'],
  },
  pro: {
    scansPerDay: 1000,
    maxFiles: 5000,
    maxFileSizeMb: 10,
    features: ['Everything in Free', 'Security scanner', 'Performance analyzer', 'Test generator', 'PR review', 'Repo chat'],
  },
  team: {
    scansPerDay: 10000,
    maxFiles: 20000,
    maxFileSizeMb: 25,
    features: ['Everything in Pro', 'Team workspaces', 'Admin analytics'],
  },
};
