// 业务逻辑
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ConsumptionRecord,
  ConsumptionRecordDocument,
} from '../interview/schemas/consumption-record.schema';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto, UpdateUserDto } from './dto/update-user.dto';
import { User, UserDocument } from './user.schema';

// export interface User {
//   id: number;
//   name: string;
//   email: string;
//   createdAt: Date;
// }

@Injectable()
export class UserService {
  // private users: User[] = [
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
  //     createdAt: new Date('2024-01-02'),
  //   },
  //   {
  //     id: 3,
  //     name: '王五',
  //     email: 'wangwu@example.com',
  //     createdAt: new Date('2024-01-03'),
  //   },
  // ];

  constructor(
    //在userservice中使用数据库配置
    // @Inject('DATABASE_CONNECTION')
    // private readonly dbConfig: any,

    // 用户Schema
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    @InjectModel(ConsumptionRecord.name)
    private consumptionRecordModel: Model<ConsumptionRecordDocument>,
    private readonly jwtService: JwtService,

    //在userservice中使用全局配置
    private configService: ConfigService,
  ) {
    // console.log('数据库配置', this.dbConfig);
  }

  // 注册用户方法
  async register(registerDto: RegisterDto) {
    const { username, email, password } = registerDto;

    // 检查用户名是否已经存在
    const existingUser = await this.userModel.findOne({
      $or: [{ username }, { email }],
    });

    if (existingUser) {
      throw new BadRequestException('用户名或邮箱已存在');
    }

    // 不存在就创建新用户,密码加密会在Schema中的pre('save')里自动进行
    const newUser = new this.userModel({
      username,
      email,
      password,
    });

    await newUser.save();

    // 创建成功后返回用户信息(除去密码)
    // const result = newUser.toObject() as Omit<User, 'password'>;
    // // delete result.password;
    // return result;
    return newUser;
  }

  // 登录方法
  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // 1.找用户
    const user = await this.userModel.findOne({ email });
    if (!user) throw new UnauthorizedException('邮箱或密码不正确');

    // 2.验证密码
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) throw new UnauthorizedException('邮箱或密码不正确');

    // 3.生成token
    const token = this.jwtService.sign({
      userId: user._id.toString(),
      username: user.username,
      email: user.email,
    });

    // 返回token和用户信息
    const userInfo = user.toObject();
    // delete userInfo.password;

    return {
      token,
      user: userInfo,
    };
  }

  // 获取用户信息
  async getUserInfo(userId: string) {
    const user = await this.userModel.findById(userId).lean().exec(); //lean() 是Mongoose 的一个优化方法。它返回的是普通JavaScript 对象，而不是Mongoose 文档对象。这样查询速度会更快,内存占用更少。
    if (!user) throw new NotFoundException('用户不存在');
    return user;
  }

  /**
   * 获取用户消费记录
   * @param userId 用户的唯一标识
   * @param options 可选的查询参数，包括跳过的记录数和限制的记录数
   * @returns 返回用户的消费记录和消费统计数据
   */
  async getUserConsumptionRecords(
    userId: string, //用户ID，用于标识和查询特定用户的消费记录
    options?: { skip: number; limit: number }, //查询选项，包含跳过记录的数量和每次查询的记录数量
  ) {
    // 如果没有传递查询选项，则默认跳过0条记录，并限制返回20条记录
    const skip = options?.skip || 0; //从第skip条记录开始
    const limit = options?.limit || 20; // 限制返回的记录数量，默认是20

    // 查询消费记录，按创建时间降序排序，跳过skip条记录，限制返回limit条记录
    const records = await this.consumptionRecordModel
      .find({ userId }) //根据用户ID查询消费记录
      .sort({ createdAt: -1 }) //按照创建时间降序排列，最新的记录排在前面
      .skip(skip) //跳过指定数量的记录
      .limit(limit) //限制返回的记录数量
      .lean(); //使用lean()优化查询结果，返回普通的Javascript对象而不是Mongoose文档

    // 统计用户各类型的消费信息，使用MongoDB聚合框架
    const stats = await this.consumptionRecordModel.aggregate([
      { $match: { userId } }, //过滤出属于当前用户的消费记录
      {
        $group: {
          _id: '$type', //按照消费类型进行分组
          count: { $sum: 1 }, //统计每种类型的消费记录数量
          successCount: {
            $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }, //统计状态为'success'的记录数
          },
          failedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }, //统计状态为'failed'的记录数
          },
          totalCost: { $sum: '$estimatedCost' }, //计算每种类型的消费总额
        },
      },
    ]);

    // 返回查询到的消费记录和消费统计信息
    return {
      records, //用户的消费记录
      stats, //按消费类型分组后的统计信息
    };
  }

  // // 更新用户信息
  // // update(id: number, userData: Partial<Omit<User, 'id' | 'createdAt'>>): User {
  // //   // const index = this.users.findIndex((user) => user.id === id);
  // //   // // index=-1时代表未找到匹配的user
  // //   // if (index === -1) {
  // //   //   return undefined;
  // //   // }
  // //   // this.users[index] = { ...this.users[index], ...userData };
  // //   // return this.users[index];
  // //   // const user = this.findOne(id); //复印findone函数，会自动处理未匹配的情况
  // //   // Object.assign(user, userData); //对象赋值（拷贝
  // //   // return user;
  // // }
  // async update(id: string, updateUserDto: any): Promise<User | null> {
  //   return this.userModel
  //     .findByIdAndUpdate(id, updateUserDto, { new: true })
  //     .exec();
  // }
  async updateUser(
    userId: string,
    updateUserDto: UpdateUserDto,
  ): Promise<User | null> {
    // 如果更新邮箱，检查邮箱是否已被占用
    if (updateUserDto.email) {
      const existingUser = await this.userModel.findOne({
        email: updateUserDto.email,
        _id: { $ne: userId },
      });
      if (existingUser) throw new BadRequestException('邮箱已被占用');
    }

    const user = await this.userModel.findByIdAndUpdate(userId, updateUserDto, {
      new: true,
    });

    if (!user) throw new NotFoundException('用户不存在');

    return user;
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new BadRequestException('用户不存在');
    }

    // 验证旧密码
    const isValid = await user?.comparePassword(dto.oldPassword);
    if (!isValid) throw new BadRequestException('旧密码不正确');

    // 设置新密码
    user.password = dto.newPassword;
    await user?.save();

    return { message: '密码修改成功' };
  }

  // 查找所有用户
  // findAll(): User[] {
  //   return this.users;
  // }
  async findAll(): Promise<User[]> {
    return this.userModel.find().exec();
  }

  // 根据id查找某一个用户
  // findOne(id: number): User {
  //   const user = this.users.find((user) => user.id === id);
  //   if (!user) {
  //     throw new NotFoundException(`用户ID${id}不存在`);
  //   }
  //   return user;
  // }
  async findOne(id: string): Promise<User | null> {
    return this.userModel.findById(id).exec();
  }

  // Omit<T, K> 是 TypeScript 的工具类型  表示从类型 T 中“去掉”某些字段（K）
  // create(userData: Omit<User, 'id' | 'createdAt'>): User {
  //   const newUser: User = {
  //     // 此处去掉id，因为id是系统自动分配的，不需要用户传递
  //     id: this.getNextId(),
  //     ...userData,
  //     createdAt: new Date(),
  //   };
  //   this.users.push(newUser);
  //   return newUser;
  // }
  async create(createUserDto: any): Promise<User> {
    return this.userModel.create(createUserDto); //密码会被自动加密
  }

  async validatePassword(email: string, password: string): Promise<User> {
    const user = await this.userModel.findOne({ email }).exec();

    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    // 使用schema中定义的方法验证密码
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('密码错误');
    }

    return user;
  }

  // // 删除用户信息
  // // remove(id: number): void {
  // //   const index = this.users.findIndex((user) => user.id === id);
  // //   // index=-1时代表未找到匹配的user
  // //   if (index === -1) {
  // //     // return false;
  // //     throw new NotFoundException(`用户ID${id}不存在`);
  // //   }
  // //   this.users.splice(index, 1);
  // //   // return true;
  // // }
  async delete(id: string): Promise<User | null> {
    return this.userModel.findByIdAndDelete(id).exec();
  }

  // // 自动分配id的函数
  // private getNextId(): number {
  //   return this.users.length > 0
  //     ? Math.max(...this.users.map((user) => user.id)) + 1
  //     : 1;
  // }
}
