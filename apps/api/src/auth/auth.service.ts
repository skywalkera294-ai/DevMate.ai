import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { compare, hash } from 'bcryptjs';
import type { AuthResponse, UserSummary } from '@devmate/shared';
import { LoginDto, RegisterDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('An account with this email already exists');

    const passwordHash = await hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name || dto.email.split('@')[0],
        passwordHash,
        provider: 'email',
      },
    });
    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const valid = await compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid email or password');
    return this.buildAuthResponse(user);
  }

  async oauthUser(profile: {
    provider: 'google' | 'github';
    providerId: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
  }): Promise<AuthResponse> {
    if (!profile.email) throw new BadRequestException('OAuth provider did not return an email');
    let user = await this.prisma.user.findFirst({
      where: { OR: [{ email: profile.email }, { providerId: profile.providerId }] },
    });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: profile.email,
          name: profile.name || profile.email.split('@')[0],
          avatarUrl: profile.avatarUrl,
          provider: profile.provider,
          providerId: profile.providerId,
        },
      });
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { avatarUrl: profile.avatarUrl, provider: profile.provider, providerId: profile.providerId },
      });
    }
    return this.buildAuthResponse(user);
  }

  async me(userId: string): Promise<UserSummary> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    return this.toSummary(user);
  }

  private buildAuthResponse(user: {
    id: string;
    email: string;
    name: string | null;
    plan: string;
    avatarUrl: string | null;
  }): AuthResponse {
    const token = this.jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        avatarUrl: user.avatarUrl,
      },
      { secret: this.config.get<string>('JWT_SECRET') || 'dev-secret', expiresIn: '7d' },
    );
    return { token, user: this.toSummary(user) };
  }

  private toSummary(user: {
    id: string;
    email: string;
    name: string | null;
    plan: string;
    avatarUrl: string | null;
  }): UserSummary {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      plan: (user.plan as UserSummary['plan']) || 'free',
      avatarUrl: user.avatarUrl,
    };
  }
}
