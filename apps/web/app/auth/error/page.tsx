'use client';

import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/logo';

export default function AuthErrorPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo />
      <div className="flex items-center gap-3 text-3xl font-bold">
        <AlertCircle className="h-8 w-8 text-destructive" /> Something went wrong
      </div>
      <p className="max-w-md text-muted-foreground">
        We couldn&apos;t complete the sign-in. The OAuth provider may not be configured on this instance. Please try again
        or sign in with email.
      </p>
      <div className="flex gap-3">
        <Link href="/login">
          <Button>Back to sign in</Button>
        </Link>
      </div>
    </div>
  );
}
