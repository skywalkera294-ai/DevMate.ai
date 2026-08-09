'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FolderOpen, LayoutDashboard, Search, Settings, TriangleAlert } from 'lucide-react';
import { Logo } from '@/components/logo';
import { Sidebar } from '@/components/sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/user-menu';

const MOBILE_NAV = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { href: '/projects', icon: FolderOpen, label: 'Projects' },
  { href: '/issues', icon: TriangleAlert, label: 'Issues' },
  { href: '/settings', icon: Settings, label: 'Settings' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-screen">
      <Sidebar paletteOpen={paletteOpen} onPaletteChange={setPaletteOpen} />
      <div className="md:pl-60">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-3 md:hidden">
            <Link href="/dashboard">
              <Logo showText={false} />
            </Link>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Search…</span>
              <kbd className="rounded border border-border px-1 text-[10px]">Ctrl K</kbd>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-30 flex h-14 items-center justify-around border-t border-border bg-background/90 backdrop-blur md:hidden">
          {MOBILE_NAV.map((item) => (
            <Link key={item.href} href={item.href} className="flex flex-col items-center gap-0.5 text-[10px] text-muted-foreground">
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
