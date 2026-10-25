import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { type AuthUser, CurrentUser, RequestIp } from '../common/auth/auth-user.js';
import {
  CreateDepositDto,
  DeleteDepositDto,
  SearchBillsDto,
  SearchDepositsByHnDto,
  SearchDepositsDto,
  UpdateDepositDto,
} from './deposits.dto.js';
import { DepositsService } from './deposits.service.js';

/** Same endpoint names as the original Express server, now behind JWT auth. */
@Controller()
export class DepositsController {
  constructor(private readonly deposits: DepositsService) {}

  @Post('search')
  @HttpCode(200)
  search(@Body() dto: SearchDepositsDto) {
    return this.deposits.searchForReturn(dto);
  }

  @Post('update')
  @HttpCode(200)
  update(
    @Body() dto: UpdateDepositDto,
    @CurrentUser() user: AuthUser,
    @RequestIp() requestIp: string,
  ) {
    return this.deposits.updateAmount(dto, { user, requestIp });
  }

  @Post('search-bills')
  @HttpCode(200)
  searchBills(@Body() dto: SearchBillsDto) {
    return this.deposits.searchBills(dto);
  }

  @Post('create-deposit')
  @HttpCode(200)
  createDeposit(
    @Body() dto: CreateDepositDto,
    @CurrentUser() user: AuthUser,
    @RequestIp() requestIp: string,
  ) {
    return this.deposits.createDeposit(dto, { user, requestIp });
  }

  @Post('search-deposits')
  @HttpCode(200)
  searchDeposits(@Body() dto: SearchDepositsByHnDto) {
    return this.deposits.searchByHn(dto);
  }

  @Post('delete-deposit')
  @HttpCode(200)
  deleteDeposit(
    @Body() dto: DeleteDepositDto,
    @CurrentUser() user: AuthUser,
    @RequestIp() requestIp: string,
  ) {
    return this.deposits.deleteDeposit(dto, { user, requestIp });
  }
}
