import { Transform, Type } from 'class-transformer';
import { IsObject, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';
import { ClinicIpDto } from '../clinic/clinic-ip.dto.js';
import { trim } from '../common/validation.js';

const DATE_INVALID = 'วันที่ไม่ถูกต้อง';
const BRANCH_INVALID = 'สาขาไม่ถูกต้อง กรุณาเลือกสาขาใหม่';

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

/** An empty string means "not given" (the UI sends '' for "all branches" / no expiry limit). */
const emptyToUndefined = ({ value }: { value: unknown }): unknown => {
  const v = typeof value === 'string' ? value.trim() : value;
  return v === '' ? undefined : v;
};

/**
 * POST /export/branches: the branches that appear on the bills of one clinic server.
 */
export class ExportBranchesDto extends ClinicIpDto {}

/**
 * One branch exactly as POST /export/branches lists it. Both parts are compared as stored: nothing is
 * trimmed (a name stored with a trailing space must still match), and an empty name means "bills that
 * have no branch name".
 */
export class ExportBranchDto {
  @IsString({ message: BRANCH_INVALID })
  @MaxLength(50, { message: BRANCH_INVALID })
  code!: string;

  @IsString({ message: BRANCH_INVALID })
  @MaxLength(200, { message: BRANCH_INVALID })
  name!: string;
}

/**
 * POST /export/courses: purchased courses that are still active, one row per treatment in the course.
 * `branch` picks one branch by code AND name (live data reuses the code "01" for different branches);
 * leave it out for every branch. `due_from` / `due_to` (yyyy-mm-dd, both included) limit the course
 * expiry date; leave them out for no limit.
 */
export class ExportCoursesDto extends ClinicIpDto {
  @IsOptional()
  @IsObject({ message: BRANCH_INVALID })
  @ValidateNested()
  @Type(() => ExportBranchDto)
  branch?: ExportBranchDto | null;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString({ message: DATE_INVALID })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: DATE_INVALID })
  due_from?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString({ message: DATE_INVALID })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: DATE_INVALID })
  due_to?: string;
}
