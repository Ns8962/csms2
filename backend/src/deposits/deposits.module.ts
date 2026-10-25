import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { ClinicModule } from '../clinic/clinic.module.js';
import { DepositsController } from './deposits.controller.js';
import { DepositsService } from './deposits.service.js';

@Module({
  imports: [ClinicModule, AuditModule],
  controllers: [DepositsController],
  providers: [DepositsService],
})
export class DepositsModule {}
