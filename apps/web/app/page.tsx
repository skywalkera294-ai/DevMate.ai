'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Bug,
  Code2,
  FileText,
  FlaskConical,
  GitPullRequest,
  MessageSquare,
  Network,
  ShieldCheck,
  Sparkles,
  Star,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';
import { Logo } from '@/components/logo';

const TOOLS = [
  { icon: Code2, title: 'Code Review', desc: 'AI-powered reviews on every commit, with actionable feedback.' },
  { icon: Bug, title: 'Bug Detection', desc: 'Catches infinite loops, off-by-ones and logic errors before CI does.' },
  { icon: ShieldCheck, title: 'Security Scanning', desc: 'Injection, XSS, secrets and unsafe patterns — flagged with fixes.' },
  { icon: FileText, title: 'Docs & README', desc: 'Generate documentation, READMEs and deployment configs from code.' },
  { icon: FlaskConical, title: 'Test Generation', desc: 'Unit tests that mirror your actual code paths, not templates.' },
  { icon: MessageSquare, title: 'Repo Chat', desc: 'Ask questions about your codebase and get cited answers instantly.' },
];

const STEPS = [
  { n: '01', title: 'Create a project', desc: 'Upload a folder, paste files or import straight from GitHub.' },
  { n: '02', title: 'Run a scan', desc: 'Pick a tool — review, security, bugs, docs, tests — and let AI analyze it.' },
  { n: '03', title: 'Act on the findings', desc: 'Fix issues, track them, and keep every repo healthy.' },
];

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: '/forever',
    desc: 'For trying things out',
    features: ['3 scans / day', 'Up to 50 files', 'All AI tools', 'Community support'],
    cta: 'Start free',
    highlighted: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$19',
    period: '/month',
    desc: 'For serious developers',
    features: ['1,000 scans / day', 'Up to 2,000 files', 'Priority queue', 'Email support'],
    cta: 'Go Pro',
    highlighted: true,
  },
  {
    id: 'team',
    name: 'Team',
    price: '$49',
    period: '/month',
    desc: 'For teams shipping together',
    features: ['10,000 scans / day', 'Unlimited files', 'Shared issue tracking', 'Dedicated support'],
    cta: 'Go Team',
    highlighted: false,
  },
];

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <div className="pointer-events-none fixed inset-0 bg-grid opacity-40" />
      <div className="pointer-events-none fixed inset-0 bg-glow" />

      <header className="relative z-10 mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Logo />
        <nav className="flex items-center gap-4">
          <Link href="#features" className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline">
            Features
          </Link>
          <Link href="#pricing" className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline">
            Pricing
          </Link>
          <ThemeToggle />
          {user ? (
            <Link href="/dashboard">
              <Button size="sm">Open app <ArrowRight className="h-4 w-4" /></Button>
            </Link>
          ) : (
            <Link href="/login">
              <Button size="sm">Get started <ArrowRight className="h-4 w-4" /></Button>
            </Link>
          )}
        </nav>
      </header>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24 pt-20 text-center">
        <div className="mb-6 animate-fade-up inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Runs fully offline — no API keys required
        </div>
        <h1 className="mx-auto max-w-3xl animate-fade-up text-4xl font-bold tracking-tight sm:text-6xl">
          The AI-powered workspace for <span className="text-gradient">developers</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl animate-fade-up text-lg text-muted-foreground">
          DevMate AI automates code review, bug detection, security scanning, documentation and test generation —
          so you ship better software, faster.
        </p>
        <div className="mt-8 flex animate-fade-up items-center justify-center gap-3">
          {user ? (
            <Link href="/dashboard">
              <Button size="lg">Open your workspace <ArrowRight className="h-4 w-4" /></Button>
            </Link>
          ) : (
            <>
              <Link href="/register">
                <Button size="lg">Start free <ArrowRight className="h-4 w-4" /></Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline">Sign in</Button>
              </Link>
            </>
          )}
        </div>
        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <span className="flex text-warning">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="h-4 w-4 fill-current" />
            ))}
          </span>
          Loved by developers shipping every day
        </div>
      </section>

      <section id="features" className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <h2 className="mb-10 text-center text-3xl font-bold tracking-tight">Everything your workflow needs</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((t) => (
            <Card key={t.title} className="group transition-colors hover:border-primary/40">
              <CardContent className="p-6">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform group-hover:scale-110">
                  <t.icon className="h-5 w-5" />
                </div>
                <h3 className="mb-1 font-semibold">{t.title}</h3>
                <p className="text-sm text-muted-foreground">{t.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <h2 className="mb-10 text-center text-3xl font-bold tracking-tight">How it works</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-xl border border-border bg-card p-6">
              <div className="text-3xl font-bold text-primary/40">{s.n}</div>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <h2 className="mb-10 text-center text-3xl font-bold tracking-tight">Simple pricing</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {PLANS.map((p) => (
            <Card key={p.id} className={p.highlighted ? 'relative border-primary shadow-lg shadow-primary/10' : ''}>
              {p.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
                  Popular
                </div>
              )}
              <CardContent className="p-6">
                <div className="text-sm font-medium text-muted-foreground">{p.name}</div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-bold">{p.price}</span>
                  <span className="text-sm text-muted-foreground">{p.period}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
                <ul className="mt-6 space-y-2 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" /> {f}
                    </li>
                  ))}
                </ul>
                <Link href={user ? '/settings' : '/register'} className="mt-6 block">
                  <Button className="w-full" variant={p.highlighted ? 'default' : 'outline'}>
                    {p.cta}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <footer className="relative z-10 border-t border-border py-8 text-center text-sm text-muted-foreground">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <Logo showText={false} />
          <p>Created by Aatmadip Ghosh</p>
          <div className="flex gap-4">
            <GitPullRequest className="h-4 w-4" />
            <MessageSquare className="h-4 w-4" />
            <Network className="h-4 w-4" />
          </div>
        </div>
      </footer>
    </div>
  );
}
