import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
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
@Catch(BadRequestException)
export class UnauthorizedExceptionFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const exceptionResponse = exception.getResponse() as HttpExceptionResponse;
    const messages = (() => {
      if (typeof exceptionResponse === 'string') return [exceptionResponse];
      const m = exceptionResponse.message;
      if (Array.isArray(m)) return m;
      if (typeof m === 'string') return [m];
      return ['请求参数校验失败'];
    })();

    response.status(400).json({
      code: 400,
      message: messages,
      data: null,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
