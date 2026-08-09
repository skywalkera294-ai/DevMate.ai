import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Logo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-sky-500 text-primary-foreground shadow">
        <Sparkles className="h-4 w-4" strokeWidth={2.2} />
      </span>
      {showText && (
        <span className="text-lg font-semibold tracking-tight">
          DevMate<span className="text-gradient"> AI</span>
        </span>
      )}
    </span>
  );
}
