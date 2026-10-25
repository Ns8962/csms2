import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppMeta, AppMetaSchema, Branch, BranchSchema } from './branch.schema.js';
import { BranchesController } from './branches.controller.js';
import { BranchesService } from './branches.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Branch.name, schema: BranchSchema },
      { name: AppMeta.name, schema: AppMetaSchema },
    ]),
  ],
  controllers: [BranchesController],
  providers: [BranchesService],
})
export class BranchesModule {}
