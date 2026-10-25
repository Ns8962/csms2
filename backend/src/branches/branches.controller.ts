import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { BranchesService } from './branches.service.js';

@Controller()
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get('ip-list')
  list() {
    return this.branches.list();
  }

  @Post('refresh-ip-list')
  @HttpCode(200)
  refresh() {
    return this.branches.refresh();
  }
}
