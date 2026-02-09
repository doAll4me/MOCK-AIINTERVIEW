import { Injectable, UnauthorizedException } from '@nestjs/common'; //引入NestJs的依赖注入装饰器
import { ConfigService } from '@nestjs/config'; //引入Nests的配置服务，用于获取配置项
import { PassportStrategy } from '@nestjs/passport'; //引入Passportstrategy 基类,用于扩展策略
import { ExtractJwt, Strategy } from 'passport-jwt'; //引入JwT策略和提取JwT的方法

interface JwtPayload {
  userId: number;
  username: string;
  roles?: string[];
}

@Injectable() //使用@Injectable装饰器使Jwtstrategy可以被NestJs的依赖注入系统管理
export class JwtStrategy extends PassportStrategy(Strategy) {
  // 构造函数接收configService实例，用于获取配置
  constructor(private readonly configService: ConfigService) {
    // 调用父类构造函数，传递JwT的配置选项
    super({
      // 从请求的Authorization头部提取Bearer Token
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // 不忽略JWT的过期时间(默认为false)
      ignoreExpiration: false,
      // 获取JwT的密钥，如果配置中没有找到，则使用默认值'eeKey'
      secretOrKey: configService.get<string>('JWT_SECRET') || 'eeKey',
    });
  }

  // JwT验证通过后执行的逻辑
  validate(payload: JwtPayload) {
    // payload 是 jwt.sign() 时塞进去的内容,是解密后的JwT数据
    if (!payload.userId) {
      throw new UnauthorizedException('Token无效');
    }
    return {
      userId: payload.userId,
      username: payload.username,
      roles: payload.roles || ['user'],
    };
    // 返回的东西会挂到 req.user
  }
}
