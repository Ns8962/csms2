import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { ClinicModule } from '../clinic/clinic.module.js';
import { DfController } from './df.controller.js';
import { DfService } from './df.service.js';

@Module({
  imports: [ClinicModule, AuditModule],
  controllers: [DfController],
  providers: [DfService],
})
export class DfModule {}
