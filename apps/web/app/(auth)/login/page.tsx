'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Github, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Welcome back!');
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function oauth(provider: 'google' | 'github') {
    setError('');
    try {
      const res = await api<{ url: string }>(`/auth/oauth/${provider}/url`);
      window.location.href = res.url;
    } catch {
      setError(`${provider === 'google' ? 'Google' : 'GitHub'} OAuth is not configured on this instance.`);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Sign in to DevMate AI</CardTitle>
        <CardDescription>Enter your credentials to continue</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Sign in
          </Button>
        </CardContent>
      </form>
      <CardContent className="space-y-2 pt-0">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs text-muted-foreground">
            <span className="bg-card px-2">or continue with</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={() => oauth('google')}>
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.3h6.5c-.1 1-.9 2.7-2.5 3.8l-.1.1 3.6 2.8.3.1c2.4-2.2 3.7-5.4 3.7-8.9z" />
              <path fill="#34A853" d="M12 24c3.3 0 6-1.1 8-2.9l-3.8-3c-1 .7-2.4 1.2-4.2 1.2-3.2 0-6-2.1-7-5l-.1.1-3.7 2.9-.1.1C3.1 21.4 7.3 24 12 24z" />
              <path fill="#FBBC05" d="M5 14.3a7.8 7.8 0 0 1 0-4.6l.1-.1L1.4 6.7l-.1.1a12 12 0 0 0 0 10.4l3.7-2.9z" />
              <path fill="#EA4335" d="M12 4.8c2.3 0 3.8 1 4.7 1.8l3.4-3.3C18 1.2 15.3 0 12 0 7.3 0 3.1 2.6 1.3 6.8l3.8 2.9c1-2.9 3.7-4.9 6.9-4.9z" />
            </svg>
            Google
          </Button>
          <Button type="button" variant="outline" onClick={() => oauth('github')}>
            <Github className="h-4 w-4" /> GitHub
          </Button>
        </div>
      </CardContent>
      <CardFooter className="justify-center text-sm text-muted-foreground">
        New here?{' '}
        <Link href="/register" className="ml-1 font-medium text-primary hover:underline">
          Create an account
        </Link>
      </CardFooter>
    </Card>
  );
}
