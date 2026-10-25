import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../../users/users.service.js';
import type { AuthenticatedRequest, JwtPayload } from './auth-user.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

const UNAUTHORIZED = {
  success: false,
  message: 'Session expired. Please login again.',
};

/**
 * Global guard: every route needs a valid Bearer token unless marked @Public().
 * The user is re-checked in the database so disabling a user takes effect immediately.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException(UNAUTHORIZED);
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException(UNAUTHORIZED);
    }

    const user = await this.users.findActiveById(payload.sub);
    if (!user) throw new UnauthorizedException(UNAUTHORIZED);

    req.user = { userId: String(user._id), username: user.username };
    return true;
  }
}
