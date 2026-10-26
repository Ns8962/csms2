import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';
import { ClinicIpDto } from '../clinic/clinic-ip.dto.js';
import { trim } from '../common/validation.js';

const DATE_INVALID = 'วันที่ไม่ถูกต้อง';

/**
 * POST /export/df: doctor-fee rows created between two calendar days, both included,
 * counted in Thai time (UTC+7). Dates are `yyyy-mm-dd`, the value of an <input type="date">.
 * Whether they are real dates and in order is checked by ExportService (it needs the same parser).
 */
export class ExportDfDto extends ClinicIpDto {
  @Transform(trim)
  @IsString({ message: 'กรุณาเลือกวันที่เริ่มต้น' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: DATE_INVALID })
  from!: string;

  @Transform(trim)
  @IsString({ message: 'กรุณาเลือกวันที่สิ้นสุด' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: DATE_INVALID })
  to!: string;
}
