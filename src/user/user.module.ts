import { Module } from '@nestjs/common';
import { ShareModule } from 'src/share/share.module';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [ShareModule], //导入共享模块
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService], //导出服务，供其他模块使用
})
export class UserModule {}
