// 服务：通常包含业务逻辑，比如数据库操作、API调用等。
import { Injectable } from '@nestjs/common';

// @Injectable装饰器表示这个类可以被注入到其他类中。这是依赖注入的前提。
@Injectable()
export class AppService {
  getHello(): string {
    return '开始新的项目了！';
  }
}
