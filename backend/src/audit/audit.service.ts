import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog } from './audit-log.schema.js';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@InjectModel(AuditLog.name) private readonly logs: Model<AuditLog>) {}

  /**
   * Called after the clinic change succeeded. A failure here must not turn a
   * completed change into an error response, so it is logged loudly instead.
   */
  async record(entry: AuditLog): Promise<void> {
    try {
      await this.logs.create(entry);
    } catch (err) {
      this.logger.error(
        `Audit write failed for ${entry.action} ${entry.documentId} on ${entry.clinicIp}: ${(err as Error).message}`,
        JSON.stringify(entry),
      );
    }
  }
}
