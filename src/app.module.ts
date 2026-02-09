// 整个后端应用的“入口模块”，应用的根模块，所有其他模块都需要在这里导入
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
// import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
// import { JwtStrategy } from './auth/jwt.strategy';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './auth/jwt.strategy';
import { CommonModule } from './common/common.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { configValidationSchema } from './config/config.schema';
import { InterviewController } from './interview/interview.controller';
import { InterviewModule } from './interview/interview.module';
import { PaymentModule } from './payment/Payment.module';
import { StsModule } from './sts/sts.module';
import { UserModule } from './user/user.module';
import { WechatModule } from './wechat/wechat.module';

// Module装饰器，用来定义模块
@Module({
  // 加载模块，引入子模块（功能拆分
  imports: [
    // 全局配置
    ConfigModule.forRoot({
      //决定加载哪个 .env 文件(NestJS 不会自动根据文件名判断环境,它只认你传给 envFilePath 的路径)
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
      isGlobal: true, //是否注册为全局模块
      validationSchema: configValidationSchema, //环境变量的「入库校验」
      //校验行为的细节控制
      validationOptions: {
        allowUnknown: true, //是否允许 .env 里存在 schema 没定义的变量
        abortEarly: true, //遇到第一个校验错误就停止
      },
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
    PassportModule, //认证框架
    // 业务模块导入
    // JSON Web Token:用户登录和权限控制
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        // const expirationSeconds = getTokenExpirationSeconds();
        return {
          secret:
            configService.get<string>('JWT_SECRET') ?? 'AI-interview-secret',
          signOptions: {
            expiresIn: configService.get<string>('JEW_EXPIRATION') || '7d', //token过期时间 7天
          },
        };
      },
      // secret: 'eeKey', //从环境变量中读取
      // signOptions: { expiresIn: '24h' },
      inject: [ConfigService],
      global: true,
    }),

    // 功能模块
    UserModule,
    WechatModule,
    PaymentModule,
    StsModule,
    InterviewModule,
    // DatabaseModule,

    CommonModule, //事件服务模块
  ],
  // 接口入口，注册控制器。控制器负责处理HTTP请求。
  controllers: [AppController, InterviewController],
  // 提供者（服务 & 中间件）。提供者通常是服务类，包含业务逻辑。
  providers: [
    AppService,
    JwtStrategy, //全局路由守卫(查token)
    // LoggerMiddleware,
    // EmailService,
    {
      //全局响应包装拦截器
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      // 全局异常过滤器
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    // {
    //   //全局日志拦截器
    //   provide: APP_INTERCEPTOR,
    //   useClass: LoggingInterceptor,
    // },
    // {
    //   //全局缓存拦截器
    //   provide: APP_INTERCEPTOR,
    //   useClass: CacheInterceptor,
    // },
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
