// 控制器只负责处理HTTP请求，业务逻辑都在服务中
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
// import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Roles, RolesGuard } from 'src/roles/roles.guard';
import { CreateUserDto } from './dto/create-user.dto';
import type { User } from './user.service';
import { UserService } from './user.service';

@Controller('user') // 表示这是一个控制器，路由前缀是/users
// @UseGuards(JwtAuthGuard) //使用守卫(所有路由都需要认证)
export class UserController {
  // 依赖注入:在构造函数中注入UserService
  constructor(private readonly userService: UserService) {}

  @Get() //表示处理GET请求，路由是/users。调用userService.findAl1()返回所有用户
  findAll(): User[] {
    return this.userService.findAll();
    // 模拟observable使用
    // findAll(): Observable<User[]> {
    // return of([
    //   {
    //     id: 1,
    //     name: '张三',
    //     email: 'zhangsan@example.com',
    //     createdAt: new Date('2024-01-01'),
    //   },
    //   {
    //     id: 2,
    //     name: '李四',
    //     email: 'lisi@example.com',
    //     createdAt: new Date('2024-01-01'),
    //   },
    // ]).pipe(
    //   delay(1000), //模拟延迟
    //   map((users) => users),
    // );
  }

  @Get(':id') //表示处理 GET请求，路由是/users/:id（:id是路由参数）。
  // 参数解析 + 校验，确保id一定是number类型的（@Param('id',ParseIntPipe)获取路由参数，ParseIntPipe 将字符串转换为数字。
  findOne(@Param('id', ParseIntPipe) id: number): User {
    // // 调用 Service
    // const user = this.userService.findOne(id);
    // // 处理HTTP 错误：如果用户不存在，抛出 NotFoundException
    if (id > 100) {
      throw new NotFoundException(`用户ID${id}不存在`);
    }
    return this.userService.findOne(id); //直接调用service里封装好的函数
  }

  // @Post() //表示处理POST请求。
  // // @Body()获取请求体数据。
  // create(@Body() createUserDto: { name: string; email: string }): User {
  //   return this.userService.create(createUserDto); //调用userService.create()创建新用户
  // }

  @Post()
  // @HttpCode(HttpStatus.CREATED) //为了返回符合 HTTP 规范的状态码 201 Created
  // 添加dto数据验证
  create(@Body() createUserDto: CreateUserDto): User {
    return this.userService.create(createUserDto);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: { name?: string; email?: string },
  ): User {
    // const user = this.userService.update(id, updateUserDto);
    // if (!user) {
    //   throw new NotFoundException(`用户ID${id}不存在`);
    // }
    // return user;
    return this.userService.update(id, updateUserDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number): void {
    // const success = this.userService.remove(id);
    // if (!success) {
    //   throw new NotFoundException(`用户ID${id}不存在`);
    // }
    return this.userService.remove(id);
  }

  // @Patch(':id')
  // partialUpdate(@Param('id') id: string, @Body() updateUserDto: any) {
  //   return `部分更新用户${id}`;
  // }

  @Get('users')
  @Roles('admin')
  getUsers() {
    //只有admin角色可以访问
  }

  @Get('users')
  @Roles('admin', 'moderator')
  getStats() {
    // 只有admin或moderator角色可以访问
  }

  @Get('info')
  getInfo(@Request() req: ExpressRequest) {
    // req.user包含从JWT中解析的用户信息
    return req.user ?? null;
  }

  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles('admin')
  getAdminInfo(@Request() req: ExpressRequest) {
    // 只有admin角色可以访问
    return { message: '管理员信息', user: req.user ?? null };
  }
}
