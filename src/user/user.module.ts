// 模块配置
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserController } from './user.controller';
import { User, UserSchema } from './user.schema';
import { UserService } from './user.service';

@Module({
  imports: [
    // 注册数据库Schema,让UserService可以使用User这个数据集合
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ], //导入共享模块
  controllers: [UserController],
  providers: [UserService], //注册提供者（简写
  // providers: [
  //   {
  //     provide: UserService,
  //     useClass: UserService,
  //   },
  // ],

  exports: [UserService], //导出服务，供其他模块使用
})
export class UserModule {}
