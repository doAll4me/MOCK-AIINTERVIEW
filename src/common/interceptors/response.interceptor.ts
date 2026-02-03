import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { map, Observable } from 'rxjs';

// 定义统一响应协议
export interface ResponseFormat<T = any> {
  code: number; //业务状态码
  message: string; //给前端/用户看的提示语
  data: T | null; //Controller 真正返回的数据（泛型 T）
  timestamp: string; //响应生成时间
  path: string; //当前请求路径
}

@Injectable() //这是一个可注入的拦截器：
//           输入：Controller 返回的类型是 T    输出：统一变成 ResponseFormat<T>
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ResponseFormat<T>
> {
  /**
   *   // intercept 方法：拦截器真正工作的地方
   * @param context  当前请求上下文（HTTP / WS / RPC）
   * @param next 一个 开关 ，用来继续执行 Controller
   * @returns 不是结果本身，而是 结果加工管道
   */
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ResponseFormat<T>> {
    const ctx = context.switchToHttp();
    // const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // next.handle()执行 Controller
    return next.handle().pipe(
      // map 统一加工 Controller 返回值
      map((data: T | ResponseFormat<T>) => {
        // 处理空数据
        if (data === null || data === undefined) {
          return {
            code: HttpStatus.OK,
            message: '操作成功',
            data: null,
            timestamp: new Date().toISOString(),
            path: request.url,
          };
        }

        // 如果返回的数据已经是标准格式了，就直接返回
        if (
          data &&
          typeof data === 'object' &&
          'code' in data &&
          'message' in data
        ) {
          return {
            ...data,
            timestamp: new Date().toISOString(),
            path: request.url,
          };
        }

        // 标准成功响应格式
        return {
          code: HttpStatus.OK,
          message: '操作成功',
          data: data,
          timestamp: new Date().toISOString(),
          path: request.url,
        };
      }),
    );
  }
}
