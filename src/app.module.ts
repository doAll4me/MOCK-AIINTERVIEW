// 应用的根模块，所有其他模块都需要在这里导入
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { InterviewController } from './interview/interview.controller';

// Module装饰器，用来定义模块
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, //全局模块
    }),
    // 配置MongoDB连接
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      // 工厂函数，用来创建MongoDB的配置
      useFactory: (ConfigService: ConfigService) => ({
        uri:
          ConfigService.get<string>('MONGOD_URI') ||
          'mongodb://localhost:27017/AI-interview',
      }),
      inject: [ConfigService],
    }),
    UserModule,
  ],
  // 注册控制器。控制器负责处理HTTP请求。
  controllers: [AppController, InterviewController],
  // 注册提供者。提供者通常是服务类，包含业务逻辑。
  providers: [AppService],
})
export class AppModule {}
