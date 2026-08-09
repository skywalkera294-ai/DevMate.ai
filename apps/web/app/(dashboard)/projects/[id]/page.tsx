'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  FileCode2,
  FilePlus2,
  FolderGit2,
  Loader2,
  MessageSquare,
  Play,
  Search,
  Send,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import type { ProjectSummary, ScanResult, ScanType } from '@devmate/shared';
import { SCAN_TYPES } from '@devmate/shared';
import { api } from '@/lib/api';
import { cn, formatDate, formatRelative } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { SCAN_META, ScanIcon, ScanStatusBadge } from '@/components/scan-meta';
import { ScanResultViewer } from '@/components/scan-result-viewer';

interface ScanRecord {
  id: string;
  projectId: string;
  type: ScanType;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  result: ScanResult | null;
}

interface ChatAnswer {
  text: string;
  citations: Array<{ path: string; line: number; snippet: string; score: number }>;
  usedLlm: boolean;
}

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

function isScanError(e: unknown): string {
  return e instanceof Error ? e.message : 'Scan failed';
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('overview');
  const [runningType, setRunningType] = useState<ScanType | null>(null);
  const [result, setResult] = useState<{ scan: ScanRecord; result: ScanResult | null } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [addFileOpen, setAddFileOpen] = useState(false);
  const [pendingScanId, setPendingScanId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { data: project, isLoading, isError } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api<ProjectSummary>(`/projects/${id}`),
  });

  const { data: scans } = useQuery({
    queryKey: ['scans', id],
    queryFn: () => api<Omit<ScanRecord, 'result'>[]>(`/projects/${id}/scans`),
  });

  const { data: aiStatus } = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => api<{ provider: string; model: string | null; llmAvailable: boolean }>('/ai/status'),
    staleTime: 60_000,
  });

  const poll = useCallback(async (scanId: string) => {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const s = await api<ScanRecord>(`/projects/${id}/scans/${scanId}`);
        if (s.status === 'COMPLETED' || s.status === 'FAILED') {
          setPendingScanId(null);
          setRunningType(null);
          setResult({ scan: s, result: s.result });
          queryClient.invalidateQueries({ queryKey: ['scans', id] });
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          if (s.status === 'FAILED') toast.error(s.error || 'Scan failed');
          return;
        }
      } catch {
        // keep polling
      }
    }
    setPendingScanId(null);
    setRunningType(null);
  }, [id, queryClient]);

  const runScan = useCallback(
    async (type: ScanType) => {
      setResult(null);
      setRunningType(type);
      try {
        const s = await api<ScanRecord>(`/projects/${id}/scans`, { method: 'POST', body: { type } });
        if (s.status === 'COMPLETED') {
          setRunningType(null);
          setResult({ scan: s, result: s.result });
          toast.success(`${SCAN_META[type].label} complete`);
          queryClient.invalidateQueries({ queryKey: ['scans', id] });
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        } else {
          setPendingScanId(s.id);
          void poll(s.id);
        }
      } catch (err) {
        setRunningType(null);
        toast.error(isScanError(err));
      }
    },
    [id, queryClient, poll],
  );

  const uploadMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append('files', f);
      return api<{ ok: boolean; added: string[] }>(`/projects/${id}/files`, { method: 'POST', body: fd });
    },
    onSuccess: (res) => {
      toast.success(`Uploaded ${res.added.length} file(s)`);
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (e) => toast.error(isScanError(e)),
    onSettled: () => setUploading(false),
  });

  const addTextMutation = useMutation({
    mutationFn: async (body: { path: string; content: string }) =>
      api<{ ok: boolean }>(`/projects/${id}/files/text`, { method: 'POST', body }),
    onSuccess: () => {
      toast.success('File added');
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setAddFileOpen(false);
    },
    onError: (e) => toast.error(isScanError(e)),
  });

  const deleteFileMutation = useMutation({
    mutationFn: (path: string) => api(`/projects/${id}/files`, { method: 'DELETE', body: { path } }),
    onSuccess: () => {
      toast.success('File deleted');
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: () => api(`/projects/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Project deleted');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      router.push('/projects');
    },
  });

  const sendChat = useCallback(async () => {
    const q = chatInput.trim();
    if (!q || chatLoading) return;
    setChatInput('');
    const tempId = `u${Date.now()}`;
    setChatMessages((m) => [...m, { id: tempId, role: 'user', content: q, createdAt: new Date().toISOString() }]);
    setChatLoading(true);
    try {
      const res = await api<{ answer: ChatAnswer; messages: ChatMsg[] }>(`/projects/${id}/chat`, {
        method: 'POST',
        body: { query: q },
      });
      setChatMessages(res.messages);
    } catch (e) {
      toast.error(isScanError(e));
      setChatMessages((m) => m.filter((x) => x.id !== tempId));
    } finally {
      setChatLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [chatInput, chatLoading, id]);

  const loadChatHistory = useCallback(async () => {
    try {
      const hist = await api<ChatMsg[]>(`/projects/${id}/chat`);
      setChatMessages(hist);
    } catch {
      /* ignore */
    }
  }, [id]);

  const scanTools = useMemo(() => SCAN_TYPES.filter((t) => t !== 'REPO_CHAT'), []);
  const runningScan = scans?.find((s) => s.status === 'RUNNING' || s.status === 'PENDING');

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64 rounded" />
        <Skeleton className="h-40 rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !project) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <p className="text-muted-foreground">Project not found.</p>
        <Button variant="outline" onClick={() => router.push('/projects')}>Back to projects</Button>
      </div>
    );
  }

  const langs = Object.entries(project.languages ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-8">
      <div>
        <Button variant="ghost" size="sm" className="mb-3 -ml-2 text-muted-foreground" onClick={() => router.push('/projects')}>
          <ArrowLeft className="h-4 w-4" /> Projects
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
            {project.description && <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><FileCode2 className="h-4 w-4" /> {project.fileCount} files</span>
              <span>·</span>
              <span>{project.linesOfCode.toLocaleString()} LOC</span>
              {project.openIssues ? (
                <>
                  <span>·</span>
                  <span className="text-warning">{project.openIssues} open issues</span>
                </>
              ) : null}
              {project.repoUrl && (
                <>
                  <span>·</span>
                  <a href={project.repoUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                    <FolderGit2 className="h-3.5 w-3.5" /> {project.repoUrl.replace('https://', '')}
                  </a>
                </>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {langs.map(([lang, count]) => (
                <Badge key={lang} variant="secondary" className="normal-case">
                  {lang} · {count}
                </Badge>
              ))}
            </div>
          </div>
          <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => deleteProjectMutation.mutate()}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="chat">Repo Chat</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div>
            <h2 className="mb-3 text-lg font-semibold">Run a scan</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {scanTools.map((t) => {
                const meta = SCAN_META[t];
                const busy = runningType === t || (pendingScanId != null && runningType === null);
                const disabled = runningType != null && runningType !== t;
                return (
                  <button
                    key={t}
                    disabled={disabled}
                    onClick={() => runScan(t)}
                    className={cn(
                      'flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all',
                      !disabled && 'hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md',
                      busy && 'border-primary',
                      disabled && 'opacity-50',
                    )}
                  >
                    <span className={cn('mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', busy ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary')}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <meta.icon className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium">{meta.label}</span>
                        {!disabled && !busy && <Play className="h-3.5 w-3.5 text-muted-foreground" />}
                      </span>
                      <span className="block text-xs text-muted-foreground">{meta.blurb}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {result && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ScanIcon type={result.scan.type} />
                  <span className="font-semibold">{SCAN_META[result.scan.type].label}</span>
                  <ScanStatusBadge status={result.scan.status} />
                  <span className="text-xs text-muted-foreground">{formatRelative(result.scan.createdAt)}</span>
                </div>
              </div>
              {result.result ? (
                <ScanResultViewer result={result.result} />
              ) : (
                <Card>
                  <CardContent className="flex items-center gap-3 p-5 text-sm text-destructive">
                    <Loader2 className="h-4 w-4 animate-spin" /> {result.scan.error || 'Scan failed'}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {scans && scans.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">Scan history</h2>
              <Card>
                <CardContent className="divide-y divide-border p-0">
                  {scans.slice(0, 12).map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setResult(null);
                        api<ScanRecord>(`/projects/${id}/scans/${s.id}`).then((full) =>
                          setResult({ scan: full, result: full.result }),
                        );
                      }}
                      className="flex w-full items-center gap-3 px-5 py-3 text-left text-sm transition-colors hover:bg-accent/50"
                    >
                      <ScanIcon type={s.type} className="text-muted-foreground" />
                      <span className="flex-1 font-medium">{SCAN_META[s.type].label}</span>
                      <ScanStatusBadge status={s.status} />
                      <span className="text-xs text-muted-foreground">{formatDate(s.createdAt)}</span>
                    </button>
                  ))}
                </CardContent>
              </Card>
            </section>
          )}
        </TabsContent>

        <TabsContent value="files" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) {
                  setUploading(true);
                  uploadMutation.mutate(e.target.files);
                  e.target.value = '';
                }
              }}
            />
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload files
            </Button>
            <Button variant="outline" onClick={() => setAddFileOpen(true)}>
              <FilePlus2 className="h-4 w-4" /> Add text file
            </Button>
          </div>
          {!project.files || project.files.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <FileCode2 className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No files yet. Upload source code to start analyzing.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="divide-y divide-border p-0">
                {project.files.map((f) => (
                  <div key={f.path} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <FileCode2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-mono">{f.path}</span>
                    <Badge variant="secondary" className="hidden normal-case sm:inline">{f.language}</Badge>
                    <span className="text-xs text-muted-foreground">{Math.max(1, Math.round(f.size / 102.4) / 10)} KB</span>
                    <button
                      onClick={() => deleteFileMutation.mutate(f.path)}
                      className="text-muted-foreground transition-colors hover:text-destructive"
                      aria-label={`Delete ${f.path}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="chat">
          <Card className="flex h-[520px] flex-col">
            <CardHeader className="flex-row items-center justify-between space-y-0 border-b">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">Ask your codebase</CardTitle>
                {aiStatus && (
                  <Badge variant={aiStatus.llmAvailable ? 'default' : 'secondary'} title={aiStatus.model ? `Model: ${aiStatus.model}` : undefined}>
                    {aiStatus.llmAvailable ? (
                      <>
                        <Sparkles className="h-3 w-3" /> AI connected
                      </>
                    ) : (
                      'Offline search'
                    )}
                  </Badge>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={loadChatHistory}>
                <Search className="h-4 w-4" /> Load history
              </Button>
            </CardHeader>
            <div className="flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin">
              {chatMessages.length === 0 && (
                <div className="flex h-full items-center justify-center text-center">
                  <div>
                    <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      Ask anything about this repo — e.g. &quot;How is authentication handled?&quot;
                    </p>
                  </div>
                </div>
              )}
              {chatMessages.map((m) => (
                <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                      m.role === 'user' ? 'bg-primary text-primary-foreground' : 'border border-border bg-card',
                    )}
                  >
                    {m.role === 'assistant' ? (
                      <div className="markdown-body">
                        <SimpleMarkdown text={m.content} />
                      </div>
                    ) : (
                      m.content
                    )}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-2xl border border-border bg-card px-4 py-2.5">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:300ms]" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="border-t border-border p-3">
              <form
                className="flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendChat();
                }}
              >
                <Textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask about this repo…"
                  className="min-h-[44px] max-h-32 resize-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void sendChat();
                    }
                  }}
                />
                <Button type="submit" size="icon" disabled={chatLoading || !chatInput.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={addFileOpen} onOpenChange={setAddFileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a text file</DialogTitle>
            <DialogDescription>Paste source code directly into the project.</DialogDescription>
          </DialogHeader>
          <AddFileForm
            loading={addTextMutation.isPending}
            onSubmit={(body) => addTextMutation.mutate(body)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddFileForm({ loading, onSubmit }: { loading: boolean; onSubmit: (body: { path: string; content: string }) => void }) {
  const [path, setPath] = useState('src/main.py');
  const [content, setContent] = useState('');

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (path.trim() && content.trim()) onSubmit({ path: path.trim(), content });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="path">File path</Label>
        <Input id="path" value={path} onChange={(e) => setPath(e.target.value)} placeholder="src/example.py" className="font-mono" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="content">Content</Label>
        <Textarea id="content" value={content} onChange={(e) => setContent(e.target.value)} rows={10} placeholder="# Paste code here" className="font-mono" />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={loading || !path.trim() || !content.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Add file
        </Button>
      </DialogFooter>
    </form>
  );
}

function SimpleMarkdown({ text }: { text: string }) {
  return <ReactMarkdown>{text}</ReactMarkdown>;
}
