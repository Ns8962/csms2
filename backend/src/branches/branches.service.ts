import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { Model } from 'mongoose';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { AppMeta, Branch } from './branch.schema.js';
import { type IpEntry, parseIpList } from './ip-list.parser.js';

const META_KEY = 'ip_list';
const FETCH_TIMEOUT_MS = 15_000;

export interface IpListResponse {
  success: boolean;
  message?: string;
  list: IpEntry[];
  updatedAt: string | null;
}

@Injectable()
export class BranchesService {
  private readonly logger = new Logger(BranchesService.name);

  constructor(
    @InjectModel(Branch.name) private readonly branches: Model<Branch>,
    @InjectModel(AppMeta.name) private readonly meta: Model<AppMeta>,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async list(): Promise<IpListResponse> {
    const [rows, meta] = await Promise.all([
      this.branches
        .find({}, { _id: 0, ip: 1, label: 1 })
        .sort({ sort: 1, _id: 1 })
        .lean()
        .exec(),
      this.meta.findOne({ key: META_KEY }).lean().exec(),
    ]);
    const updatedAt = (meta?.value as { updatedAt?: string } | null)?.updatedAt ?? null;
    return {
      success: true,
      list: rows.map((r) => ({ ip: r.ip, label: r.label ?? '' })),
      updatedAt,
    };
  }

  /** "↻ โหลดรายการใหม่จาก Google Sheet": re-reads IP_LIST_SOURCE_URL and replaces the list. */
  async refresh(): Promise<IpListResponse> {
    const source = this.config.get('IP_LIST_SOURCE_URL', { infer: true });
    if (!source) {
      return {
        ...(await this.list()),
        success: false,
        message: 'ยังไม่ได้ตั้งค่า IP_LIST_SOURCE_URL (ลิงก์ CSV ของ Google Sheet) ที่ backend',
      };
    }

    let entries: IpEntry[];
    try {
      const res = await fetch(source, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      entries = parseIpList(await res.text());
    } catch (err) {
      this.logger.warn(`IP list refresh failed: ${(err as Error).message}`);
      return {
        ...(await this.list()),
        success: false,
        message: 'โหลดรายการจาก Google Sheet ไม่สำเร็จ',
      };
    }

    if (entries.length === 0) {
      return {
        ...(await this.list()),
        success: false,
        message: 'ไม่พบ IP ในแหล่งข้อมูล รายการเดิมยังไม่ถูกแทนที่',
      };
    }

    // Insert the new set first, then drop the old one, so the list is never empty.
    const syncId = randomUUID();
    await this.branches.insertMany(
      entries.map((e, i) => ({ ip: e.ip, label: e.label, sort: i, syncId })),
    );
    await this.branches.deleteMany({ syncId: { $ne: syncId } }).exec();
    await this.meta
      .updateOne(
        { key: META_KEY },
        { value: { updatedAt: new Date().toISOString(), count: entries.length } },
        { upsert: true },
      )
      .exec();

    this.logger.log(`IP list refreshed: ${entries.length} entries`);
    return this.list();
  }
}
