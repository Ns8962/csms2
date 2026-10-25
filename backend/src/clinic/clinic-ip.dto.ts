import { Transform } from 'class-transformer';
import { IsIP } from 'class-validator';
import { trim } from '../common/validation.js';

/** Every clinic call carries the branch IP, so concurrent users never share a connection. */
export class ClinicIpDto {
  @Transform(trim)
  @IsIP('4', { message: 'IP Address ไม่ถูกต้อง' })
  ip!: string;
}
