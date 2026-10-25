import { plainToInstance, Type } from 'class-transformer';
import {
  Contains,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

/**
 * Every setting the backend reads from the environment (.env).
 * Defaults target local development; see .env.example for production notes.
 */
export class EnvironmentVariables {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  /**
   * Interface to listen on. The default keeps the API reachable from this machine only; use
   * 0.0.0.0 to serve other machines (and set TRUST_PROXY when a reverse proxy sits in front).
   */
  @IsString()
  @IsNotEmpty()
  HOST = '127.0.0.1';

  /** App database (users, branch IP list, audit log). */
  @IsString()
  @IsNotEmpty()
  MONGO_URI = 'mongodb://127.0.0.1:27017/csms2';

  @IsString()
  @MinLength(32, { message: 'JWT_SECRET must be at least 32 characters' })
  JWT_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_EXPIRES_IN = '8h';

  /** Comma-separated usernames created on boot when missing (all share SEED_PASSWORD). */
  @IsOptional()
  @IsString()
  SEED_USERNAMES?: string;

  @IsOptional()
  @IsString()
  SEED_PASSWORD?: string;

  /** Connection string for a clinic (branch) server. `{ip}` is replaced by the chosen IP. */
  @IsString()
  @Contains('{ip}')
  CLINIC_MONGO_URI_TEMPLATE = 'mongodb://{ip}:27017';

  /** Database name of the DreaseV2 clinic data on each branch server. */
  @IsString()
  @IsNotEmpty()
  CLINIC_DB_NAME = 'mris';

  @Type(() => Number)
  @IsInt()
  @Min(500)
  @Max(60000)
  CLINIC_CONNECT_TIMEOUT_MS = 5000;

  /** Google Sheet CSV export URL (or a JSON endpoint returning {list:[{ip,label}]}) for "refresh IP list". */
  @IsOptional()
  @IsString()
  IP_LIST_SOURCE_URL?: string;

  /** Comma-separated allowed origins. Leave empty when the frontend is served same-origin. */
  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;

  /** Built frontend folder to serve at "/" (relative to the backend folder). */
  @IsOptional()
  @IsString()
  FRONTEND_DIST?: string;

  /** Express "trust proxy" setting, e.g. 1 when running behind one reverse proxy / Cloudflare. */
  @IsOptional()
  @IsString()
  TRUST_PROXY?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  // Treat empty strings in .env as "not set" so defaults and @IsOptional apply.
  const cleaned = Object.fromEntries(
    Object.entries(config).filter(([, v]) => v !== ''),
  );
  const validated = plainToInstance(EnvironmentVariables, cleaned, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return validated;
}
