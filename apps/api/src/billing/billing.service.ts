import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PLAN_LIMITS } from '../common/constants';

const PLANS = [
  { id: 'free', name: 'Free', price: 0, interval: 'month', tagline: 'For trying things out', features: PLAN_LIMITS.free.features, limits: { scansPerDay: PLAN_LIMITS.free.scansPerDay, files: PLAN_LIMITS.free.maxFiles } },
  { id: 'pro', name: 'Pro', price: 19, interval: 'month', tagline: 'For serious developers', features: PLAN_LIMITS.pro.features, limits: { scansPerDay: PLAN_LIMITS.pro.scansPerDay, files: PLAN_LIMITS.pro.maxFiles } },
  { id: 'team', name: 'Team', price: 49, interval: 'month', tagline: 'For teams shipping together', features: PLAN_LIMITS.team.features, limits: { scansPerDay: PLAN_LIMITS.team.scansPerDay, files: PLAN_LIMITS.team.maxFiles } },
];

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  plans() {
    return PLANS;
  }

  async current(ownerId: string) {
    const [user, subscription] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: ownerId } }),
      this.prisma.subscription.findUnique({ where: { ownerId } }),
    ]);
    const plan = PLANS.find((p) => p.id === (user?.plan ?? 'free'));
    return {
      plan: user?.plan ?? 'free',
      planDetails: plan,
      subscription: subscription
        ? { id: subscription.id, provider: subscription.provider, status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null }
        : null,
      limits: PLAN_LIMITS[user?.plan ?? 'free'],
    };
  }

  async upgrade(ownerId: string, plan: string) {
    if (!PLANS.some((p) => p.id === plan)) throw new BadRequestException('Unknown plan');
    await this.prisma.user.update({ where: { id: ownerId }, data: { plan } });
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    const subscription = await this.prisma.subscription.upsert({
      where: { ownerId },
      create: { ownerId, plan, provider: 'mock', status: 'active', currentPeriodEnd: periodEnd },
      update: { plan, status: 'active', currentPeriodEnd: periodEnd },
    });
    return {
      ok: true,
      plan,
      subscription: { id: subscription.id, status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null },
      message: `You are now on the ${plan} plan. (Mock checkout — connect Stripe for real payments.)`,
    };
  }

  async cancel(ownerId: string) {
    await this.prisma.user.update({ where: { id: ownerId }, data: { plan: 'free' } });
    await this.prisma.subscription.update({ where: { ownerId }, data: { status: 'canceled' } });
    return { ok: true, plan: 'free', message: 'Subscription canceled. You are back on the Free plan.' };
  }
}
