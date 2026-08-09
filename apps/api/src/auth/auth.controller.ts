import { Body, Controller, Get, HttpCode, Post, Query, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthResponse } from '@devmate/shared';

const SCOPES = 'repo read:user';

@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto): Promise<AuthResponse> {
    return this.auth.register(dto);
  }

  @Public()
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.auth.login(dto);
  }

  @Get('me')
  me(@CurrentUser() user: JwtUser) {
    return this.auth.me(user.id);
  }

  // ---------- Google OAuth ----------
  @Public()
  @Get('oauth/google/url')
  googleUrl(@Query('redirect') redirect?: string): { url: string } {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) throw new UnauthorizedException('Google OAuth is not configured');
    const base = this.config.get<string>('GOOGLE_AUTH_URL') || 'https://accounts.google.com/o/oauth2/v2/auth';
    const callback = `${this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000'}/api/auth/oauth/google/callback`;
    const url = `${base}?client_id=${clientId}&redirect_uri=${encodeURIComponent(callback)}&response_type=code&scope=${encodeURIComponent('openid email profile')}&access_type=offline`;
    void redirect;
    return { url };
  }

  @Public()
  @Get('oauth/google/callback')
  async googleCallback(@Query('code') code: string | undefined, @Res() res: Response) {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    if (!code || !clientId || !clientSecret) {
      return res.redirect(`${this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000'}/auth/error`);
    }
    const tokenUrl = this.config.get<string>('GOOGLE_TOKEN_URL') || 'https://oauth2.googleapis.com/token';
    const callback = `${this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000'}/api/auth/oauth/google/callback`;
    const tokRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callback,
        grant_type: 'authorization_code',
      }).toString(),
    });
    const tok = (await tokRes.json()) as { access_token?: string };
    if (!tok.access_token) return res.redirect(this.frontend('/auth/error'));

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    const profile = (await profileRes.json()) as {
      sub?: string;
      email?: string;
      name?: string;
      picture?: string;
    };
    if (!profile.sub) return res.redirect(this.frontend('/auth/error'));

    const auth = await this.auth.oauthUser({
      provider: 'google',
      providerId: profile.sub,
      email: profile.email ?? '',
      name: profile.name ?? null,
      avatarUrl: profile.picture ?? null,
    });
    return res.redirect(this.frontend(`/auth/callback?token=${encodeURIComponent(auth.token)}`));
  }

  // ---------- GitHub OAuth ----------
  @Public()
  @Get('oauth/github/url')
  githubUrl(): { url: string } {
    const clientId = this.config.get<string>('GITHUB_CLIENT_ID');
    if (!clientId) throw new UnauthorizedException('GitHub OAuth is not configured');
    const base = this.config.get<string>('GITHUB_AUTH_URL') || 'https://github.com/login/oauth/authorize';
    const callback = this.githubCallbackUrl();
    const url = `${base}?client_id=${clientId}&redirect_uri=${encodeURIComponent(callback)}&scope=${encodeURIComponent(SCOPES)}`;
    return { url };
  }

  @Public()
  @Get('oauth/github/callback')
  async githubCallback(@Query('code') code: string | undefined, @Res() res: Response) {
    const clientId = this.config.get<string>('GITHUB_CLIENT_ID');
    const clientSecret = this.config.get<string>('GITHUB_CLIENT_SECRET');
    if (!code || !clientId || !clientSecret) {
      return res.redirect(this.frontend('/auth/error'));
    }
    const tokRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    const tok = (await tokRes.json()) as { access_token?: string };
    if (!tok.access_token) return res.redirect(this.frontend('/auth/error'));

    const profileRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tok.access_token}`, 'User-Agent': 'DevMate-AI' },
    });
    const profile = (await profileRes.json()) as { id?: number; login?: string; email?: string; name?: string; avatar_url?: string };
    if (!profile.id) return res.redirect(this.frontend('/auth/error'));

    const auth = await this.auth.oauthUser({
      provider: 'github',
      providerId: String(profile.id),
      email: profile.email ?? `${profile.login}@users.noreply.github.com`,
      name: profile.name ?? profile.login ?? null,
      avatarUrl: profile.avatar_url ?? null,
    });
    return res.redirect(this.frontend(`/auth/callback?token=${encodeURIComponent(auth.token)}`));
  }

  private githubCallbackUrl(): string {
    return `${this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000'}/api/auth/oauth/github/callback`;
  }

  private frontend(path: string): string {
    return `${this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000'}${path}`;
  }
}
