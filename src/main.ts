// 应用入口
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core'; //NestFactory 是用来创建NestS应用实例的工厂类。
import * as dotenv from 'dotenv';
import { AppModule } from './app.module'; //应用的根模块

dotenv.config();

// 启动应用的函数
async function bootstrap() {
  // 使用NestFactory.create()创建NestJS应用实例，传入AppModule 作为根模块。
  const app = await NestFactory.create(AppModule);
  //启动服务器，监听3000端口。我们的应用会在3000端口上运行
  await app.listen(process.env.PORT ?? 3000);
  app.useGlobalPipes(new ValidationPipe());
}

// 调用bootstrap()函数，启动应用。
void bootstrap();
