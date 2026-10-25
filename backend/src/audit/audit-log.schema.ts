import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type AuditAction = 'deposit.update' | 'deposit.create' | 'deposit.delete' | 'df.update';

/**
 * One row per change the tool makes on a clinic database.
 * The original CSMS kept no record of who changed which deposit.
 */
@Schema({ collection: 'audit_logs', timestamps: { createdAt: true, updatedAt: false } })
export class AuditLog {
  @Prop({ type: String, required: true, index: true })
  action!: AuditAction;

  @Prop({ type: String, required: true, index: true })
  username!: string;

  @Prop({ type: String, required: true, index: true })
  clinicIp!: string;

  @Prop({ type: String, required: true })
  clinicDb!: string;

  @Prop({ type: String, required: true })
  collectionName!: string;

  @Prop({ type: String, required: true, index: true })
  documentId!: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  before!: Record<string, unknown> | null;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  after!: Record<string, unknown> | null;

  @Prop({ type: String, default: '' })
  requestIp!: string;
}

export type AuditLogDocument = HydratedDocument<AuditLog>;
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ createdAt: -1 });
