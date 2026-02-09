import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateUserDto {
  @Transform(({ value }) => (value as string).trim()) //去除空格
  @IsString({ message: '用户名必须是字符串' })
  @IsNotEmpty({ message: '用户名不能为空' })
  @MinLength(2, { message: '用户名至少2个字符' })
  @MaxLength(20, { message: '用户名最多20个字符' })
  @Matches(/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/, {
    message: '用户名只能包含字母、数字、下划线和中文',
  })
  nickname?: string;

  @IsString()
  @IsOptional()
  avatar?: string;

  @IsEmail({}, { message: '邮箱格式不正确' })
  @IsNotEmpty({ message: '邮箱不能为空' })
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  // @IsString({ message: '密码必须是字符串' })
  // @IsNotEmpty({ message: '密码不能为空' })
  // @MinLength(6, { message: '密码至少6个字符' })
  // @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
  //   message: '密码必须包含大小写字母和数字',
  // })
  // password: string;
}

export class ChangePasswordDto {
  @IsString({ message: '密码必须是字符串' })
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(6, { message: '密码至少6个字符' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: '密码必须包含大小写字母和数字',
  })
  oldPassword: string;

  @IsString({ message: '密码必须是字符串' })
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(6, { message: '密码至少6个字符' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: '密码必须包含大小写字母和数字',
  })
  newPassword: string;
}
