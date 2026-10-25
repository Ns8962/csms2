import { Module } from '@nestjs/common';
import { ClinicConnectionService } from './clinic-connection.service.js';
import { ClinicController } from './clinic.controller.js';

@Module({
  controllers: [ClinicController],
  providers: [ClinicConnectionService],
  exports: [ClinicConnectionService],
})
export class ClinicModule {}
