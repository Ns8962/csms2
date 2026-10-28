import { Body, Controller, HttpCode, Post, Res, StreamableFile } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { type AuthUser, CurrentUser, RequestIp } from '../common/auth/auth-user.js';
import { ExportBranchesDto, ExportCoursesDto, ExportDfDto } from './export.dto.js';
import { ExportService, XLSX_MIME } from './export.service.js';

/** ส่งออกข้อมูล: reports downloaded as Excel files. Namespaced under /api/export (a menu the original never had). */
@Controller('export')
export class ExportController {
  constructor(private readonly exports: ExportService) {}

  /** The file is the response body; the UI reads the row count, total and unreadable-amount count from the headers. */
  @Post('df')
  @HttpCode(200)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async df(
    @Body() dto: ExportDfDto,
    @CurrentUser() user: AuthUser,
    @RequestIp() requestIp: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.exports.exportDf(dto, { user, requestIp });
    res.set({
      'Content-Type': XLSX_MIME,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Content-Length': String(file.buffer.length),
      'Cache-Control': 'no-store',
      'X-Export-Rows': String(file.rows),
      'X-Export-Total': file.total.toFixed(2),
      'X-Export-Unreadable': String(file.unreadable),
    });
    return new StreamableFile(file.buffer);
  }

  /** Branches on the bills of one clinic server, for the branch picker of the course export. */
  @Post('branches')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async branches(@Body() dto: ExportBranchesDto) {
    return { success: true, branches: await this.exports.listBranches(dto) };
  }

  /** Remaining courses as a file; the UI reads the counts from the headers. */
  @Post('courses')
  @HttpCode(200)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async courses(
    @Body() dto: ExportCoursesDto,
    @CurrentUser() user: AuthUser,
    @RequestIp() requestIp: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.exports.exportCourses(dto, { user, requestIp });
    res.set({
      'Content-Type': XLSX_MIME,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Content-Length': String(file.buffer.length),
      'Cache-Control': 'no-store',
      'X-Export-Rows': String(file.rows),
      'X-Export-Courses': String(file.courses),
      'X-Export-Unreadable': String(file.unreadable),
      'X-Export-No-Treatment': String(file.noTreatment),
      'X-Export-No-Bill': String(file.noBill),
      'X-Export-Patients': String(file.patients),
      'X-Export-No-Phone': String(file.noPhone),
      'X-Export-Phone-Unavailable': file.phoneUnavailable ? '1' : '0',
    });
    return new StreamableFile(file.buffer);
  }
}
