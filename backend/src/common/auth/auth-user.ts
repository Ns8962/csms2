import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthUser {
  userId: string;
  username: string;
}

export interface JwtPayload {
  sub: string;
  username: string;
}

/** Who made a change and from where; recorded in the audit log. */
export interface Actor {
  user: AuthUser;
  requestIp: string;
}

export type AuthenticatedRequest = Request & { user?: AuthUser };

/** Injects the user resolved by JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.user) {
      throw new Error('CurrentUser used on a route without JwtAuthGuard');
    }
    return req.user;
  },
);

/** Client address for the audit log (honours TRUST_PROXY via req.ip). */
export const RequestIp = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string =>
    ctx.switchToHttp().getRequest<Request>().ip ?? '',
);
