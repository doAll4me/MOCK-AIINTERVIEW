// 控制器：负责处理HTTP请求
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

// 装饰器定义这是一个控制器。括号里可以传入路由前缀，比如@Controller('users')表示所有路由都会加上/users 前缀。
@Controller()
export class AppController {
  // constructor 中注入了ApService，这是依赖注入的体现。 private readonly私有只读
  constructor(private readonly appService: AppService) {}

  // 装饰器定义
  // GET请求处理函数，括号里可以传入路由路径，比如 @Get('hello')表示处理 /hello路径的GET请求。如果不传，就表示处理根路径/。
  @Get()
  getHello(): string {
    // 调用appService.getHello()并返回结果。
    return this.appService.getHello();
  }
}
