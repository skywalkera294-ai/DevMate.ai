import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { verify, JwtPayload } from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from '../constants';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const auth = req.headers.authorization as string | undefined;
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = auth.slice('Bearer '.length);
    const secret = this.config.get<string>('JWT_SECRET') || 'dev-secret';
    try {
      const payload = verify(token, secret) as JwtPayload & {
        id: string;
        email: string;
        name: string | null;
        plan: string;
        avatarUrl: string | null;
      };
      req.user = {
        id: payload.id,
        email: payload.email,
        name: payload.name ?? null,
        plan: payload.plan ?? 'free',
        avatarUrl: payload.avatarUrl ?? null,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
