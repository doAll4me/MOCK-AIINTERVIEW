import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
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
 * Filter 只处理异常，不处理成功响应
 * @Catch() 决定捕获范围，越具体优先级越高
 * @Catch() 捕获所有异常
 * @Catch(HttpException) 只捕获 HttpException异常
 *@Catch(HttpException,ValidationException) 捕获多种异常
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  // exception: unknown：不能假设exception（返回值）是什么类型（可能是 HttpException、Error、甚至奇怪的值）
  // host: ArgumentsHost：统一的执行上下文，用来适配不同协议（HTTP/WS/RPC）
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // 设置默认值
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = '服务器内部错误';
    let error: string | undefined;

    // const status =
    //   exception instanceof HttpException
    //     ? exception.getStatus()
    //     : HttpStatus.INTERNAL_SERVER_ERROR;

    // const message =
    //   exception instanceof HttpException
    //     ? exception.getResponse()
    //     : '服务器内部错误';

    // 用 instanceof HttpException区分“框架异常”和“未知异常”
    // 1.HttpException （可控、业务常见）：BadRequestException / UnauthorizedException / ForbiddenException
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse =
        exception.getResponse() as HttpExceptionResponse;
      // 处理 exception.getResponse() 的多种形态
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse;
        message = responseObj.message ?? '请求失败';
        error = responseObj.error;
      }
    } // 处理其他异常：普通 Error / 未知异常（不可控，通常是 bug）
    else if (exception instanceof Error) {
      message = exception.message || '服务器内部错误';
      this.logger.error(
        `未处理异常：${exception.message}`,
        exception.stack,
        'AllExceptionsFilter',
      );
    }

    // 记录错误日志
    const msgText = Array.isArray(message) ? message[0] : message;
    this.logger.error(
      `${request.method} ${request.url} - ${status} -${msgText}`,
    );

    // 返回统一格式的错误响应
    const errorResponse = {
      code: status,
      message: msgText,
      data: null,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(error && { error }),
    };

    response.status(status).json(errorResponse);
  }
}
