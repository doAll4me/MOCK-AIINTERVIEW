import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { AuthUser } from './types/auth-user.type';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // 守卫逻辑
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('未提供认证令牌');
    }

    // 将用户信息附加到请求对象
    request.user = this.getUserFromToken(token);

    return true;
  }

  // 获取token的函数
  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }

  // 验证token的私有函数
  private validateToken(token: string): boolean {
    //token验证逻辑
    return token.startsWith('Bearer');
  }

  // token中提取用户信息函数
  private getUserFromToken(token: string): AuthUser {
    console.log(token);
    return { userId: 1, username: '测试', roles: ['user'] };
  }
}
