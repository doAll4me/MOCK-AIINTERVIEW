// 整个后端应用的“入口模块”，应用的根模块，所有其他模块都需要在这里导入
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CacheInterceptor } from './common/interceptors/cache.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { DatabaseModule } from './database/database.module';
import { EmailService } from './email/email.service';
import { InterviewController } from './interview/interview.controller';
import { InterviewModule } from './interview/interview.module';
import { UserModule } from './user/user.module';

// Module装饰器，用来定义模块
@Module({
  // 加载模块，引入子模块（功能拆分
  imports: [
    // 全局配置
    ConfigModule.forRoot({
      isGlobal: true, //全局模块
    }),
    // 配置MongoDB连接，MongooseModule.forRootAsync（异步数据库连接）
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      // 工厂函数，用来创建MongoDB的配置
      useFactory: (ConfigService: ConfigService) => ({
        uri:
          ConfigService.get<string>('MONGODB_URI') ||
          'mongodb://localhost:27017/AI-interview',
      }),
      inject: [ConfigService],
    }),
    // 业务模块导入
    UserModule,
    InterviewModule,
    DatabaseModule,
  ],
  // 接口入口，注册控制器。控制器负责处理HTTP请求。
  controllers: [AppController, InterviewController],
  // 提供者（服务 & 中间件）。提供者通常是服务类，包含业务逻辑。
  providers: [
    AppService,
    LoggerMiddleware,
    EmailService,
    {
      //全局响应包装拦截器
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      //全局日志拦截器
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      //全局缓存拦截器
      provide: APP_INTERCEPTOR,
      useClass: CacheInterceptor,
    },
  ],
})

// implements NestModule这个模块要使用中间件，NestJS 会在启动时调用 configure()。
export class AppModule implements NestModule {
  // consumer 中间件注册器
  configure(consumer: MiddlewareConsumer) {
    // apply 应用 LoggerMiddleware 这个中间件   ||   forRoutes('*')对所有路由生效
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
