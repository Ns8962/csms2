import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import type { JwtPayload } from '../common/auth/auth-user.js';
import { UsersService } from '../users/users.service.js';

const INVALID_CREDENTIALS =
  'Invalid credentials. Please check your username and password.';

// Compared against when the username does not exist, so response time
// does not reveal which usernames are valid.
const DUMMY_HASH = bcrypt.hashSync('csms2-timing-equaliser', 12);

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.users.findActiveByUsername(username);
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      throw new UnauthorizedException({ success: false, message: INVALID_CREDENTIALS });
    }

    const payload: JwtPayload = { sub: String(user._id), username: user.username };
    const accessToken = await this.jwt.signAsync(payload);
    await this.users.touchLogin(String(user._id));
    return { success: true, accessToken, user: { username: user.username } };
  }
}
