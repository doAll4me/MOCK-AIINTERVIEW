import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';

type HttpExceptionResponse =
  | string
  | {
      message?: string | string[];
      error?: string;
      statusCode?: number;
      [key: string]: unknown;
    };

/**
 * @Catch() 装饰器用于指定要捕获的异常类型:
 * @Catch() 捕获所有异常
 * @Catch(HttpException) 只捕获 HttpException异常
 *@Catch(HttpException,ValidationException) 捕获多种异常
 */
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  //  ArgumentsHost提供了执行上下文的信息
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse() as HttpExceptionResponse;

    let message: string | string[] = '服务器内部错误';
    let error: string | undefined;

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else {
      message = exceptionResponse.message ?? '请求失败';
      if (typeof exceptionResponse.error === 'string')
        error = exceptionResponse.error;
    }

    response.status(status).json({
      code: status,
      message: Array.isArray(message) ? message[0] : message,
      data: null,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(error && { error }),
    });
  }
}
