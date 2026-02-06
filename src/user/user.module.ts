import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DatabaseModule } from 'src/database/database.module';
import { User, UserSchema } from './schemas/user.schema';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [
    DatabaseModule,
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
