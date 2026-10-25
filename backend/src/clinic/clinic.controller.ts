import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ClinicConnectionService } from './clinic-connection.service.js';
import { ClinicIpDto } from './clinic-ip.dto.js';

@Controller()
export class ClinicController {
  constructor(private readonly clinic: ClinicConnectionService) {}

  /** "Check" button: `{ status: "ready" }` when the branch database is reachable. */
  @Post('connect')
  @HttpCode(200)
  connect(@Body() dto: ClinicIpDto) {
    return this.clinic.check(dto.ip);
  }
}
