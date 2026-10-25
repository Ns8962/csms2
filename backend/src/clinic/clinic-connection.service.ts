import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type Db,
  MongoClient,
  MongoNetworkError,
  MongoServerError,
  MongoServerSelectionError,
} from 'mongodb';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { COLLECTIONS } from './drease-v2.types.js';

/** MongoDB error code AuthenticationFailed. */
const AUTH_FAILED = 18;
const IDLE_CLOSE_MS = 10 * 60_000;
const SWEEP_EVERY_MS = 60_000;

export type ConnectResult =
  | { status: 'ready'; db: string }
  | { status: 'not_ready'; message: string };

interface CachedClient {
  client: MongoClient;
  lastUsed: number;
}

/**
 * Opens (and caches) one MongoClient per branch IP.
 *
 * The original server kept a single global "current" connection set by /connect,
 * so two CS staff on different branches could read each other's data. Here each
 * request names its IP and gets that branch's pool.
 */
@Injectable()
export class ClinicConnectionService implements OnModuleDestroy {
  private readonly logger = new Logger(ClinicConnectionService.name);
  private readonly clients = new Map<string, CachedClient>();
  private readonly pending = new Map<string, Promise<MongoClient>>();
  private readonly sweeper: NodeJS.Timeout;

  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {
    this.sweeper = setInterval(() => void this.closeIdle(), SWEEP_EVERY_MS);
    this.sweeper.unref();
  }

  get dbName(): string {
    return this.config.get('CLINIC_DB_NAME', { infer: true });
  }

  /** Pings the branch database and checks it holds the DreaseV2 `bills` collection. */
  async check(ip: string): Promise<ConnectResult> {
    try {
      const db = await this.db(ip);
      await db.command({ ping: 1 });
      // Only `bills` is required (it also catches a wrong CLINIC_DB_NAME). MongoDB creates
      // `deposit_bills` on the first insert, so a branch that has never stored a deposit, the very
      // case "รายการมัดจำไม่แสดง" repairs, must not be reported as not ready.
      const found = await db
        .listCollections({ name: COLLECTIONS.bills }, { nameOnly: true })
        .toArray();
      if (found.length === 0) {
        return {
          status: 'not_ready',
          message: `ไม่พบ ${COLLECTIONS.bills} ในฐานข้อมูล ${this.dbName}`,
        };
      }
      return { status: 'ready', db: this.dbName };
    } catch (err) {
      await this.drop(ip);
      if (err instanceof ServiceUnavailableException) {
        // Connection failed; open() already logged why and put the reason in the message.
        return { status: 'not_ready', message: this.messageOf(err) };
      }
      // Connected, but ping / listCollections failed (for example the user lacks privileges).
      this.logger.warn(`Check of clinic ${ip} failed: ${(err as Error).message}`);
      return {
        status: 'not_ready',
        message: `ตรวจสอบฐานข้อมูลสาขา ${ip} ไม่สำเร็จ (ดูรายละเอียดใน log ของ backend)`,
      };
    }
  }

  /**
   * Runs `work` against the branch database and turns connectivity failures
   * into a 503 with a message the UI can show.
   */
  async run<T>(ip: string, work: (db: Db) => Promise<T>): Promise<T> {
    const db = await this.db(ip);
    try {
      return await work(db);
    } catch (err) {
      if (err instanceof MongoServerSelectionError || err instanceof MongoNetworkError) {
        await this.drop(ip);
        throw this.unavailable(ip);
      }
      throw err;
    }
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.sweeper);
    await Promise.all([...this.clients.keys()].map((ip) => this.drop(ip)));
  }

  private async db(ip: string): Promise<Db> {
    const client = await this.client(ip);
    return client.db(this.dbName);
  }

  private client(ip: string): Promise<MongoClient> {
    const cached = this.clients.get(ip);
    if (cached) {
      cached.lastUsed = Date.now();
      return Promise.resolve(cached.client);
    }
    let opening = this.pending.get(ip);
    if (!opening) {
      opening = this.open(ip).finally(() => this.pending.delete(ip));
      this.pending.set(ip, opening);
    }
    return opening;
  }

  private async open(ip: string): Promise<MongoClient> {
    const timeout = this.config.get('CLINIC_CONNECT_TIMEOUT_MS', { infer: true });
    const uri = this.config
      .get('CLINIC_MONGO_URI_TEMPLATE', { infer: true })
      .replaceAll('{ip}', ip);
    const client = new MongoClient(uri, {
      appName: 'csms2',
      serverSelectionTimeoutMS: timeout,
      connectTimeoutMS: timeout,
      maxPoolSize: 5,
    });
    try {
      await client.connect();
    } catch (err) {
      // Never log the URI: the template may contain credentials.
      this.logger.warn(`Connect to clinic ${ip} failed: ${(err as Error).message}`);
      await client.close().catch(() => undefined);
      throw this.unavailable(ip, this.reasonFor(err));
    }
    this.clients.set(ip, { client, lastUsed: Date.now() });
    this.logger.log(`Connected to clinic ${ip} (${this.dbName})`);
    return client;
  }

  private async drop(ip: string): Promise<void> {
    const cached = this.clients.get(ip);
    if (!cached) return;
    this.clients.delete(ip);
    await cached.client.close().catch(() => undefined);
  }

  private async closeIdle(): Promise<void> {
    const cutoff = Date.now() - IDLE_CLOSE_MS;
    for (const [ip, cached] of this.clients) {
      if (cached.lastUsed < cutoff) await this.drop(ip);
    }
  }

  private messageOf(err: ServiceUnavailableException): string {
    const body = err.getResponse();
    const message = typeof body === 'object' ? (body as { message?: unknown }).message : body;
    return typeof message === 'string' ? message.replace(' กรุณากด Check ใหม่', '') : err.message;
  }

  /** Tells apart the failures that used to share one message, so the cause is visible in the UI. */
  private reasonFor(err: unknown): string {
    if (err instanceof MongoServerError && err.code === AUTH_FAILED) {
      return 'ล็อกอิน MongoDB ไม่ผ่าน (user/password ใน CLINIC_MONGO_URI_TEMPLATE ไม่ถูกต้องสำหรับเครื่องนี้)';
    }
    const text = `${(err as Error).message} ${((err as Error).cause as Error | undefined)?.message ?? ''}`;
    if (/timed out/i.test(text)) {
      return 'หมดเวลา 5 วินาที ไม่มีการตอบกลับจากพอร์ต MongoDB (firewall ของเครื่องสาขาอาจบล็อก หรือไม่ได้ต่อ VPN)';
    }
    if (/ECONNREFUSED/i.test(text)) {
      return 'เครื่องสาขาปฏิเสธการเชื่อมต่อ (MongoDB ไม่ได้เปิดพอร์ตนี้)';
    }
    return 'เชื่อมต่อไม่สำเร็จ ดูรายละเอียดใน log ของ backend';
  }

  private unavailable(ip: string, reason?: string) {
    return new ServiceUnavailableException({
      success: false,
      message: reason
        ? `เชื่อมต่อเซิร์ฟเวอร์สาขา ${ip} ไม่ได้: ${reason}`
        : `เชื่อมต่อเซิร์ฟเวอร์สาขา ${ip} ไม่ได้ กรุณากด Check ใหม่`,
    });
  }
}
