import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import bcrypt from 'bcryptjs';
import { isValidObjectId, Model } from 'mongoose';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { User, type UserDocument } from './user.schema.js';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  findActiveByUsername(username: string): Promise<UserDocument | null> {
    return this.users.findOne({ username, active: true }).exec();
  }

  findActiveById(id: string): Promise<UserDocument | null> {
    if (!isValidObjectId(id)) return Promise.resolve(null);
    return this.users.findOne({ _id: id, active: true }).exec();
  }

  async touchLogin(id: string): Promise<void> {
    await this.users.updateOne({ _id: id }, { lastLoginAt: new Date() }).exec();
  }

  hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  /** Creates SEED_USERNAMES that do not exist yet. Existing users are never modified. */
  async onApplicationBootstrap(): Promise<void> {
    const usernames = (this.config.get('SEED_USERNAMES', { infer: true }) ?? '')
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
    if (usernames.length === 0) return;

    const password = this.config.get('SEED_PASSWORD', { infer: true });
    if (!password) {
      this.logger.warn('SEED_USERNAMES is set but SEED_PASSWORD is empty; no users seeded');
      return;
    }

    for (const username of usernames) {
      const exists = await this.users.exists({ username }).exec();
      if (exists) continue;
      await this.users.create({
        username,
        passwordHash: await this.hashPassword(password),
        active: true,
      });
      this.logger.log(`Seeded user "${username}"`);
    }
  }
}
