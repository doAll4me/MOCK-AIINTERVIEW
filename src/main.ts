// 应用入口
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core'; //NestFactory 是用来创建NestS应用实例的工厂类。
import * as dotenv from 'dotenv';
import { AppModule } from './app.module'; //应用的根模块
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
// import './test-observable';

dotenv.config();

// 启动应用的函数
async function bootstrap() {
  // NestFactory :NestJS提供的工厂，用来创建应用实例
  // 使用NestFactory.create()创建NestJS应用实例，传入AppModule 作为根模块。
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    // 全局ValidationPipe验证管道
    new ValidationPipe({
      whitelist: true, //自动移除DTO中没有声明的字段
      forbidNonWhitelisted: true, //出现未声明的字段就报错
      transform: true, //自动类型转换
      transformOptions: {
        enableImplicitConversion: true, //启用隐式转换
      },
    }),
  );

  // 启用CORS跨域
  app.enableCors();

  app.useGlobalFilters(new AllExceptionsFilter()); //异常过滤器

  //启动服务器，监听3000端口。我们的应用会在3000端口上运行
  await app.listen(process.env.PORT ?? 3000);
}

// 调用bootstrap()函数，启动应用。
void bootstrap();
