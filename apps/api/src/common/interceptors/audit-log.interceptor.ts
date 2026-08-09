import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Observable, tap } from 'rxjs';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const user = req.user as { id?: string } | undefined;
    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);

    if (!user || !isWrite) return next.handle();

    return next.handle().pipe(
      tap(() => {
        this.prisma.auditLog
          .create({
            data: {
              ownerId: user.id!,
              action: `${req.method} ${req.route?.path ?? req.url ?? ''}`,
              detail: JSON.stringify({
                body: sanitizeBody(req.body),
                query: req.query,
              }).slice(0, 500),
              ip: req.ip,
            },
          })
          .catch(() => undefined);
      }),
    );
  }
}

function sanitizeBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const clone = { ...(body as Record<string, unknown>) };
  for (const k of ['password', 'token', 'secret']) {
    if (k in clone) clone[k] = '[redacted]';
  }
  return clone;
}
