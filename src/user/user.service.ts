import { Injectable } from '@nestjs/common';

export interface User {
  id: number;
  name: string;
  email: string;
}

@Injectable()
export class UserService {
  private users: User[] = [
    { id: 1, name: '张三', email: 'zhangsan@example.com' },
    { id: 2, name: '李四', email: 'lisi@example.com' },
    { id: 3, name: '王五', email: 'wangwu@example.com' },
  ];

  // 查找所有用户
  findAll(): User[] {
    return this.users;
  }

  // 根据id查找某一个用户
  findOne(id: number): User | undefined {
    return this.users.find((user) => user.id === id);
  }

  // Omit<T, K> 是 TypeScript 的工具类型  表示从类型 T 中“去掉”某些字段（K）
  create(user: Omit<User, 'id'>): User {
    const newUser: User = {
      // 此处去掉id，因为id是系统自动分配的，不需要用户传递
      id: this.users.length + 1,
      ...user,
    };
    this.users.push(newUser);
    return newUser;
  }
}
