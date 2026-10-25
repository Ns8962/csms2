import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { type AuthUser, CurrentUser, RequestIp } from '../common/auth/auth-user.js';
import { SearchDfDto, UpdateDfDto } from './df.dto.js';
import { DfService } from './df.service.js';

/** แก้ไข DF. Unlike the legacy endpoints these are namespaced under /api/df (a menu the original never had). */
@Controller('df')
export class DfController {
  constructor(private readonly df: DfService) {}

  @Post('search')
  @HttpCode(200)
  search(@Body() dto: SearchDfDto) {
    return this.df.search(dto);
  }

  @Post('update')
  @HttpCode(200)
  update(
    @Body() dto: UpdateDfDto,
    @CurrentUser() user: AuthUser,
    @RequestIp() requestIp: string,
  ) {
    return this.df.update(dto, { user, requestIp });
  }
}
