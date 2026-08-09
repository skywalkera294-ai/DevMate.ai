'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { setToken } from '@/lib/api';
import { Logo } from '@/components/logo';

function CallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuth } = useAuth();

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      router.replace('/login');
      return;
    }
    setToken(token);
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((user) => {
        setAuth({ token, user });
        router.replace('/dashboard');
      })
      .catch(() => router.replace('/login'));
  }, [searchParams, router, setAuth]);

  return (
    <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      Signing you in…
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <Logo />
      <Suspense fallback={<Loader2 className="h-6 w-6 animate-spin text-primary" />}>
        <CallbackInner />
      </Suspense>
    </div>
  );
}
