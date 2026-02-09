import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // 构造函数接受Reflector实例,用于反射获取装饰器元素
  constructor(private reflector: Reflector) {
    super(); //调用父类AuthGuard构造函数，传入jwt策略
  }

  // canActive方法用于判断是否允许请求通过（是否有权限访问该接口
  override canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // 使用Reflector从当前请求的处理方法和类中提取公开接口的元数据
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(), //获取当前处理方法的元数据
      context.getClass(), //获取当前类的元数据
    ]);

    // 如果当前接口被标记为公开接口，则直接通过
    if (isPublic) return true;

    // 否则 执行父类AuthGuard的canActivate方法，进行jwt认证
    // AuthGuard 的 canActivate 在类型声明里可能是 any，这里做类型收窄
    return super.canActivate(context);
  }

  // 错误处理
  override handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    info?: Error,
  ): TUser {
    if (err || !user) {
      throw new UnauthorizedException(info?.message || '无效的token');
    }
    return user;
  }
}
