import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { trim } from '../common/validation.js';

export class LoginDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Please enter username and password.' })
  @MaxLength(100)
  username!: string;

  @IsString()
  @IsNotEmpty({ message: 'Please enter username and password.' })
  @MaxLength(200)
  password!: string;
}
