import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Schema as MongooseSchema } from 'mongoose';

/** One branch server in the "เลือกจากรายการ" IP picker. Duplicate IPs are allowed, as in the sheet. */
@Schema({ collection: 'branches', timestamps: true })
export class Branch {
  @Prop({ type: String, required: true, index: true })
  ip!: string;

  @Prop({ type: String, default: '' })
  label!: string;

  /** Row order from the source sheet. */
  @Prop({ type: Number, default: 0, index: true })
  sort!: number;

  /** Id of the refresh run that wrote this row; older rows are removed after a refresh. */
  @Prop({ type: String, default: 'manual' })
  syncId!: string;
}

export type BranchDocument = HydratedDocument<Branch>;
export const BranchSchema = SchemaFactory.createForClass(Branch);

/** Small key/value store for app state such as when the IP list was last refreshed. */
@Schema({ collection: 'app_meta', timestamps: true })
export class AppMeta {
  @Prop({ type: String, required: true, unique: true })
  key!: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  value!: unknown;
}

export const AppMetaSchema = SchemaFactory.createForClass(AppMeta);
