import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

// 注意装饰器大写！！
export class updateUserDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;
}
