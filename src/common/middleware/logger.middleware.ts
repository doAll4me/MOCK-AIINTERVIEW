// “类中间件”，用来给每一个 HTTP 请求打完整日志：请求开始 + 请求结束（状态码 + 耗时）
import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable() //声明这是一个可注入的中间件类
export class LoggerMiddleware implements NestMiddleware {
  // 创建一个 Logger 实例
  private readonly logger = new Logger(LoggerMiddleware.name);

  // 每一个请求进来，都会先执行这个use方法
  use(req: Request, res: Response, next: NextFunction) {
    // 从请求中解构关键信息
    const { method, originalUrl, ip, headers } = req;
    // user-agent 是浏览器 / 客户端在每个 HTTP 请求里自动带的一个头,可以用来 【排查问题 & 分析来源】
    const userAgent = headers['user-agent'] || '';
    const startTime = Date.now(); //记录请求开始时间

    // 打印“请求开始”日志
    this.logger.log(`--> ${method} ${originalUrl} - ${ip} - ${userAgent}`);

    // 监听响应完毕事件
    res.on('finish', () => {
      const { statusCode } = res; //读取响应结果
      const responseTime = Date.now() - startTime; //记录请求执行至完成经历的时间
      const logLevel = statusCode >= 400 ? 'error' : 'log';

      //打印“请求结束”日志
      this.logger[logLevel](
        `<-- ${method} ${originalUrl} ${statusCode} - ${responseTime}ms - ${ip}`,
      );
    });

    // 放行请求
    next();
  }
}
