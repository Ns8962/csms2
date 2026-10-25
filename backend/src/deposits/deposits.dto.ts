import { Transform } from 'class-transformer';
import {
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ClinicIpDto } from '../clinic/clinic-ip.dto.js';
import { trim } from '../common/validation.js';

const INVOICE_INVALID = 'Invoice ไม่ถูกต้อง กรุณากรอกให้ครบ';

/** POST /search — คืนยอดมัดจำ. HN and/or Invoice. */
export class SearchDepositsDto extends ClinicIpDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  hn?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  invoice?: string;
}

/** POST /update — set deposit_bills.amount_current. */
export class UpdateDepositDto extends ClinicIpDto {
  @IsMongoId({ message: 'กรุณาเลือกรายการมัดจำ' })
  id!: string;

  @Transform(({ value }) =>
    typeof value === 'number'
      ? String(value)
      : typeof value === 'string'
        ? value.trim().replace(/,/g, '')
        : value,
  )
  @IsString({ message: 'กรุณากรอกมูลค่าตอนนี้' })
  @Matches(/^\d{1,12}(\.\d{1,2})?$/, {
    message: 'มูลค่าตอนนี้ต้องเป็นตัวเลขไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง',
  })
  amountCurrent!: string;
}

/** POST /search-bills — รายการมัดจำไม่แสดง: find deposit items in a bill. */
export class SearchBillsDto extends ClinicIpDto {
  @Transform(trim)
  @IsString({ message: INVOICE_INVALID })
  @MinLength(7, { message: INVOICE_INVALID })
  @MaxLength(30, { message: INVOICE_INVALID })
  invoice!: string;
}

/**
 * POST /create-deposit. The original client also sent `name`/`price`; they are
 * stripped here because the deposit is always built from the bill in the clinic
 * database, never from client-supplied values.
 */
export class CreateDepositDto extends SearchBillsDto {
  @IsMongoId({ message: 'กรุณาเลือกรายการที่ต้องการสร้างมัดจำ' })
  bill_list_id!: string;
}

/** POST /search-deposits — ลบรายการมัดจำ: active deposits of one HN. */
export class SearchDepositsByHnDto extends ClinicIpDto {
  @Transform(trim)
  @IsString({ message: 'กรุณากรอก HN' })
  @IsNotEmpty({ message: 'กรุณากรอก HN' })
  @MaxLength(50)
  hn!: string;
}

/** POST /delete-deposit. */
export class DeleteDepositDto extends ClinicIpDto {
  @IsMongoId({ message: 'กรุณาเลือกรายการที่ต้องการลบ' })
  deposit_id!: string;
}
