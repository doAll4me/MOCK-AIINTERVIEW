import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

interface JwtPayload {
  userId: number;
  username: string;
  roles?: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'eeKey',
    });
  }

  validate(payload: JwtPayload) {
    // payload 是 jwt.sign() 时塞进去的内容
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
