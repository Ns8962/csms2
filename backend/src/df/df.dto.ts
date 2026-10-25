import { Transform } from 'class-transformer';
import { IsMongoId, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ClinicIpDto } from '../clinic/clinic-ip.dto.js';
import { trim } from '../common/validation.js';

const INVOICE_INVALID = 'Invoice ไม่ถูกต้อง กรุณากรอกให้ครบ';

/** POST /df/search: the bill is found by HN and Invoice together (both are required). */
export class SearchDfDto extends ClinicIpDto {
  @Transform(trim)
  @IsString({ message: 'กรุณากรอก HN' })
  @IsNotEmpty({ message: 'กรุณากรอก HN' })
  @MaxLength(50)
  hn!: string;

  @Transform(trim)
  @IsString({ message: INVOICE_INVALID })
  @MinLength(7, { message: INVOICE_INVALID })
  @MaxLength(30, { message: INVOICE_INVALID })
  invoice!: string;
}

/** POST /df/update: set the DF amount of one doctorbills row that belongs to the given bill. */
export class UpdateDfDto extends ClinicIpDto {
  @IsMongoId({ message: 'ไม่พบบิล กรุณาค้นหาใหม่' })
  bill_id!: string;

  @IsMongoId({ message: 'กรุณาเลือกรายการ DF' })
  doctor_bill_id!: string;

  @Transform(({ value }) =>
    typeof value === 'number'
      ? String(value)
      : typeof value === 'string'
        ? value.trim().replace(/,/g, '')
        : value,
  )
  @IsString({ message: 'กรุณากรอกจำนวน DF' })
  @Matches(/^\d{1,12}(\.\d{1,2})?$/, {
    message: 'จำนวน DF ต้องเป็นตัวเลขไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง',
  })
  df!: string;
}
