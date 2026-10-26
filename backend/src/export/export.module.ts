import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { ClinicModule } from '../clinic/clinic.module.js';
import { ExportController } from './export.controller.js';
import { ExportService } from './export.service.js';

@Module({
  imports: [ClinicModule, AuditModule],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
