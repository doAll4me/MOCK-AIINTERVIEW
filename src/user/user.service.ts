import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';

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

    //在userservice中使用全局配置
    private configService: ConfigService,
  ) {
    // console.log('数据库配置', this.dbConfig);
  }

  someMethod() {
    // const dbUri = this.configService.get<string>('MONGODB_URI');
    // const port = this.configService.get<number>('PORT', 3000); //提供默认值
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
  async update(id: string, updateUserDto: any): Promise<User | null> {
    return this.userModel
      .findByIdAndUpdate(id, updateUserDto, { new: true })
      .exec();
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
