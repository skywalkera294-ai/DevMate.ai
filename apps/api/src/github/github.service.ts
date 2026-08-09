import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface RepoFile {
  path: string;
  content: string;
  size: number;
}

@Injectable()
export class GitHubService {
  constructor(private readonly config: ConfigService) {}

  private token(): string | null {
    return this.config.get<string>('GITHUB_TOKEN') || null;
  }

  /** Resolve a file list for a repo using the git trees API. */
  async fetchRepoFiles(repo: string, branch?: string, overrideToken?: string): Promise<RepoFile[]> {
    const token = overrideToken || this.token();
    if (!token) {
      throw new Error('GitHub integration requires a GITHUB_TOKEN env var (or connect your GitHub account).');
    }
    const cleanRepo = repo.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'DevMate-AI' };
    const branchName = branch || (await this.defaultBranch(cleanRepo, headers)) || 'main';

    const treeRes = await fetch(`https://api.github.com/repos/${cleanRepo}/git/trees/${branchName}?recursive=1`, { headers });
    if (!treeRes.ok) throw new Error(`GitHub API error: ${treeRes.status} ${await treeRes.text().catch(() => '')}`);
    const tree = (await treeRes.json()) as { tree?: Array<{ path: string; type: string; size?: number }> };

    const entries = (tree.tree ?? []).filter((t) => t.type === 'blob' && !shouldSkip(t.path));
    const files: RepoFile[] = [];
    for (const entry of entries.slice(0, 500)) {
      try {
        const contentRes = await fetch(`https://api.github.com/repos/${cleanRepo}/contents/${entry.path}?ref=${branchName}`, { headers });
        if (!contentRes.ok) continue;
        const data = (await contentRes.json()) as { content?: string };
        if (!data.content) continue;
        const text = Buffer.from(data.content, 'base64').toString('utf8');
        if (text.length > 1_000_000) continue;
        files.push({ path: entry.path, content: text, size: text.length });
      } catch {
        // skip individual failures
      }
    }
    return files;
  }

  async checkToken(token: string): Promise<{ ok: boolean; login?: string }> {
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'DevMate-AI' },
      });
      if (!res.ok) return { ok: false };
      const data = (await res.json()) as { login?: string };
      return { ok: true, login: data.login };
    } catch {
      return { ok: false };
    }
  }

  private async defaultBranch(repo: string, headers: Record<string, string>): Promise<string | null> {
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}`, { headers });
      if (!res.ok) return null;
      const data = (await res.json()) as { default_branch?: string };
      return data.default_branch ?? null;
    } catch {
      return null;
    }
  }
}

function shouldSkip(path: string): boolean {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.gif') || lower.endsWith('.ico') || lower.endsWith('.woff') || lower.endsWith('.woff2') || lower.endsWith('.ttf') || lower.endsWith('.eot') || lower.endsWith('.pdf')) return true;
  if (lower.endsWith('.lock') || lower.endsWith('.min.js') || lower.endsWith('.min.css')) return true;
  if (lower.includes('node_modules/') || lower.includes('.next/') || lower.includes('dist/') || lower.includes('coverage/')) return true;
  return false;
}
