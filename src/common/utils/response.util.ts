// 响应DTO

import { HttpStatus } from '@nestjs/common';

export class ResponseUtil {
  // 成功响应
  static success<T = any>(
    data: T,
    message: string = '操作成功',
    code: number = HttpStatus.OK,
  ) {
    return {
      code,
      message,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  // 错误响应
  static error<T = null>(
    message: string = '操作失败',
    code: number = HttpStatus.BAD_REQUEST,
    data: T = null as T,
  ) {
    return {
      code,
      message,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  // 分页响应
  static paginated<T = any>(
    data: T[],
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    },
    message: string = '查询成功',
    code: number = HttpStatus.OK,
  ) {
    return {
      code,
      message,
      data,
      pagination,
      timestamp: new Date().toISOString(),
    };
  }

  // 列表响应
  static list<T = any>(
    data: T[],
    message: string = '查询成功',
    code: number = HttpStatus.OK,
  ) {
    return {
      code,
      message,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  // 构建空响应
  static empty(message: string = '暂无数据', code: number = HttpStatus.OK) {
    return {
      code,
      message,
      data: null,
      timestamp: new Date().toISOString(),
    };
  }
}
