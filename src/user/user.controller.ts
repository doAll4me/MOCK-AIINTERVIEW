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
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { Roles, RolesGuard } from 'src/roles/roles.guard';
import { UpdateUserDto } from './dto/update-user.dto';
// import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
// import type { User } from './user.service';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthedRequest } from 'src/auth/interface/authed-request.interface';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { JwtUserPayload } from 'src/auth/jwt-payload.interface';
import { Public } from 'src/auth/public.decorator';
import { ResponseUtil } from 'src/common/dto/response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { User } from './user.schema';
import { UserService } from './user.service';

// 控制器只负责处理HTTP请求，业务逻辑都在服务中
@Controller('user') // 表示这是一个控制器，路由前缀是/users
@UseGuards(JwtAuthGuard) //使用守卫(所有路由都需要认证)
@ApiTags('用户') //给接口写文档
export class UserController {
  // 依赖注入:在构造函数中注入UserService
  constructor(private readonly userService: UserService) {}

  // 注册接口
  @Public() //不需要token认证的接口
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    const result = await this.userService.register(registerDto);
    return ResponseUtil.success(result, '注册成功');
  }

  // 登录接口
  @Public() //不需要token认证的接口
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    const result = await this.userService.login(loginDto);
    return ResponseUtil.success(result, '登录成功');
  }

  // 获取用户信息
  @ApiBearerAuth()
  @Get('info')
  // @UseGuards(JwtAuthGuard) //使用认证守卫(放在controller上统一保护了)
  async getUserInfo(@Request() req: Request & { user: JwtUserPayload }) {
    // req.user就是从token里提取出来的用户信息
    // console.log(req.user);
    const { userId } = req.user;
    return await this.userService.getUserInfo(userId);
  }

  // 获取用户消费记录
  @Get('consumption-records')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: '获取用户消费记录',
    description:
      '获取用户所有的功能消费记录，包括简历押题、专项面试、综合面试等',
  })
  async getUserConsumptionRecords(
    @Request() req: AuthedRequest,
    @Query('skip') skip: number = 0,
    @Query('limit') limit: number = 20,
  ) {
    const { userId } = req.user;
    const result = await this.userService.getUserConsumptionRecords(userId, {
      skip,
      limit,
    });
    return ResponseUtil.success(result, '获取成功');
  }

  @Put('profile')
  @UseGuards(JwtAuthGuard)
  async updateUserProfile(
    @Request() req: AuthedRequest,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    // const user = this.userService.update(id, updateUserDto);
    // if (!user) {
    //   throw new NotFoundException(`用户ID${id}不存在`);
    // }
    // return user;
    const { userId } = req.user;
    const user = await this.userService.updateUser(userId, updateUserDto);
    return ResponseUtil.success(user, '更新成功');
  }

  @Get() //表示处理GET请求，路由是/users。调用userService.findAl1()返回所有用户
  @ApiResponse({
    status: 200,
    description: '成功获取用户信息',
    type: User,
  })
  @ApiResponse({
    status: 401,
    description: '未授权，需要登录',
  })
  findAll(): Promise<User[]> {
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
  findOne(@Param('id', ParseIntPipe) id: number): Promise<User | null> {
    // // 调用 Service
    // const user = this.userService.findOne(id);
    // // 处理HTTP 错误：如果用户不存在，抛出 NotFoundException
    if (id > 100) {
      throw new NotFoundException(`用户ID${id}不存在`);
    }
    return this.userService.findOne(id.toString()); //直接调用service里封装好的函数
  }

  // @Post() //表示处理POST请求。
  // // @Body()获取请求体数据。
  // create(@Body() createUserDto: { name: string; email: string }): User {
  //   return this.userService.create(createUserDto); //调用userService.create()创建新用户
  // }
  @Post()
  // @HttpCode(HttpStatus.CREATED) //为了返回符合 HTTP 规范的状态码 201 Created
  // 添加dto数据验证
  create(@Body() createUserDto: UpdateUserDto): Promise<User> {
    return this.userService.create(createUserDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number): Promise<User | null> {
    // const success = this.userService.remove(id);
    // if (!success) {
    //   throw new NotFoundException(`用户ID${id}不存在`);
    // }
    return this.userService.delete(id.toString());
  }

  @Patch(':id')
  partialUpdate(@Param('id') id: string, @Body() updateUserDto: any) {
    return `部分更新用户${id}，更新信息：${updateUserDto}`;
  }

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

  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles('admin')
  getAdminInfo(@Request() req: ExpressRequest) {
    // 只有admin角色可以访问
    return { message: '管理员信息', user: req.user ?? null };
  }
}
