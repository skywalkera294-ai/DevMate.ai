import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

const WINDOW_MS = 60_000;
const buckets = new Map<string, { count: number; resetAt: number }>();

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger('RateLimit');

  use(req: Request, res: Response, next: NextFunction) {
    const key = req.headers['x-forwarded-for']?.toString() || req.ip || 'unknown';
    const now = Date.now();
    const bucket = buckets.get(key) ?? { count: 0, resetAt: now + WINDOW_MS };
    if (bucket.resetAt <= now) {
      bucket.count = 0;
      bucket.resetAt = now + WINDOW_MS;
    }
    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > 200) {
      res.status(429).json({ statusCode: 429, message: 'Too many requests, slow down.', error: 'Too Many Requests' });
      return;
    }
    res.setHeader('X-RateLimit-Limit', '200');
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, 200 - bucket.count)));
    next();
  }
}
