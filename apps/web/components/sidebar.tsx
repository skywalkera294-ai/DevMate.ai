'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { FolderOpen, LayoutDashboard, Search, Settings, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/logo';
import { CommandPalette } from '@/components/command-palette';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderOpen },
  { href: '/issues', label: 'Issues', icon: TriangleAlert },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar({ paletteOpen, onPaletteChange }: { paletteOpen: boolean; onPaletteChange: (o: boolean) => void }) {
  const pathname = usePathname();

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-background/60 backdrop-blur md:flex">
        <div className="flex h-16 items-center border-b border-border px-5">
          <Link href="/dashboard">
            <Logo />
          </Link>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => {
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3">
          <button
            onClick={() => onPaletteChange(true)}
            className="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">Search…</span>
            <kbd className="rounded border border-border px-1.5 text-[10px]">Ctrl K</kbd>
          </button>
        </div>
        <div className="border-t border-border p-3 text-center text-[11px] text-muted-foreground">
          Created by Aatmadip Ghosh
        </div>
      </aside>
      <CommandPalette open={paletteOpen} onOpenChange={onPaletteChange} />
    </>
  );
}
