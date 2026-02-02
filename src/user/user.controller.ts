import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import type { User } from './user.service';
import { UserService } from './user.service';

@Controller('users') // 表示这是一个控制器，路由前缀是/users
export class UserController {
  // 依赖注入:在构造函数中注入UserService
  constructor(private readonly userService: UserService) {}

  @Get() //表示处理GET请求，路由是/users。调用userService.findAl1()返回所有用户
  findAll(): User[] {
    return this.userService.findAll();
  }

  @Get(':id') //表示处理 GET请求，路由是/users/:id（:id是路由参数）。
  // 参数解析 + 校验，确保id一定是number类型的（@Param('id',ParseIntPipe)获取路由参数，ParseIntPipe 将字符串转换为数字。
  findOne(@Param('id', ParseIntPipe) id: number): User {
    // 调用 Service
    const user = this.userService.findOne(id);
    // 处理HTTP 错误：如果用户不存在，抛出 NotFoundException
    if (!user) {
      throw new NotFoundException(`用户ID${id}不存在`);
    }
    return user;
  }

  // @Post() //表示处理POST请求。
  // // @Body()获取请求体数据。
  // create(@Body() createUserDto: { name: string; email: string }): User {
  //   return this.userService.create(createUserDto); //调用userService.create()创建新用户
  // }

  @Post()
  // 添加dto数据验证
  create(@Body() createUserDto: CreateUserDto): User {
    return this.userService.create(createUserDto);
  }
}
