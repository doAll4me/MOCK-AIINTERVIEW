import { Inject, Injectable, NotFoundException } from '@nestjs/common';

export interface User {
  id: number;
  name: string;
  email: string;
  createdAt: Date;
}

@Injectable()
export class UserService {
  private users: User[] = [
    {
      id: 1,
      name: '张三',
      email: 'zhangsan@example.com',
      createdAt: new Date('2024-01-01'),
    },
    {
      id: 2,
      name: '李四',
      email: 'lisi@example.com',
      createdAt: new Date('2024-01-02'),
    },
    {
      id: 3,
      name: '王五',
      email: 'wangwu@example.com',
      createdAt: new Date('2024-01-03'),
    },
  ];

  // 在userservice中使用数据库配置
  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly dbConfig: any,
  ) {
    console.log('数据库配置', this.dbConfig);
  }

  // 查找所有用户
  findAll(): User[] {
    return this.users;
  }

  // 根据id查找某一个用户
  findOne(id: number): User {
    const user = this.users.find((user) => user.id === id);
    if (!user) {
      throw new NotFoundException(`用户ID${id}不存在`);
    }
    return user;
  }

  // Omit<T, K> 是 TypeScript 的工具类型  表示从类型 T 中“去掉”某些字段（K）
  create(userData: Omit<User, 'id' | 'createdAt'>): User {
    const newUser: User = {
      // 此处去掉id，因为id是系统自动分配的，不需要用户传递
      id: this.getNextId(),
      ...userData,
      createdAt: new Date(),
    };
    this.users.push(newUser);
    return newUser;
  }

  // 更新用户信息
  update(id: number, userData: Partial<Omit<User, 'id' | 'createdAt'>>): User {
    // const index = this.users.findIndex((user) => user.id === id);
    // // index=-1时代表未找到匹配的user
    // if (index === -1) {
    //   return undefined;
    // }
    // this.users[index] = { ...this.users[index], ...userData };
    // return this.users[index];

    const user = this.findOne(id); //复印findone函数，会自动处理未匹配的情况
    Object.assign(user, userData); //对象赋值（拷贝
    return user;
  }

  remove(id: number): void {
    const index = this.users.findIndex((user) => user.id === id);
    // index=-1时代表未找到匹配的user
    if (index === -1) {
      // return false;
      throw new NotFoundException(`用户ID${id}不存在`);
    }
    this.users.splice(index, 1);
    // return true;
  }

  // 自动分配id的函数
  private getNextId(): number {
    return this.users.length > 0
      ? Math.max(...this.users.map((user) => user.id)) + 1
      : 1;
  }
}
