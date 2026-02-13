import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import type { AuthedRequest } from 'src/auth/jwt-payload.interface';
import { ResponseUtil } from 'src/common/utils/response.util';
import {
  AnswerMockInterviewDto,
  StartMockInterviewDto,
} from './dto/mock-interview.dto';
import { ResumeQuizDto } from './dto/resume-quiz.dto';
import { InterviewService } from './services/interview.service';

@Controller('interview')
export class InterviewController {
  // 注入事件流来源
  // constructor(private readonly eventService: EventService) {}
  constructor(private readonly interviewService: InterviewService) {}
  /**
   *  定义了一个 SSE（Server-Sent Events）流式接口，完整路径是：GET  /interview/stream
   * 让客户端通过一次 HTTP 请求，持续不断地从服务器接收消息流。
   */
  // @Sse('stream')
  // // 这个接口返回的不是一个结果，而是一条 Observable 流
  // stream(): Observable<MessageEvent> {
  //   return this.eventService.generateTimedMessages().pipe(
  //     // 把“普通消息”包装成 SSE 格式
  //     map(
  //       (message) =>
  //         ({
  //           data: JSON.stringify({
  //             timestamp: new Date().toISOString(),
  //             message: message,
  //           }),
  //         }) as MessageEvent,
  //     ),
  //   );
  // }

  /**
   * 接口1：简历押题
   * @param dto
   * @param req
   * @param res
   */
  @Post('resume/quiz/stream')
  @UseGuards(JwtAuthGuard)
  resumeQuizStream(
    @Body() dto: ResumeQuizDto,
    @Request() req: AuthedRequest,
    @Res() res: Response,
  ) {
    const userId = req.user.userId;
    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream'); //浏览器识别SSE格式
    res.setHeader('Cache-control', 'no-cache'); //不缓存响应
    res.setHeader('Connection', 'keep-alive'); //保持TCP连接
    res.setHeader('X-Accel-Buffering', 'no'); //禁用Nginx缓冲
    // 订阅进度事件
    const subscribtion = this.interviewService
      .generateResumeQuizWithProgress(userId, dto)
      .subscribe({
        next: (event) => {
          // 发送SSE事件
          res.write(`data:${JSON.stringify(event)}\n\n`);
        },
        error: (error: unknown) => {
          const message =
            error instanceof Error ? error.message : String(error);

          res.write(
            `data:${JSON.stringify({ type: 'error', error: message })}\n\n`,
          );
          res.end();
        },
        complete: () => {
          res.end();
        },
      });

    // 客戶端断开连接时取消订阅
    req.on('close', () => {
      subscribtion.unsubscribe();
    });
  }

  /**
   * 接口2：开始模拟面试-SSE流式响应
   * @param dto
   * @param req
   * @param res
   */
  @Post('mock/start')
  @UseGuards(JwtAuthGuard)
  startMockInterview(
    @Body() dto: StartMockInterviewDto,
    @Request() req: AuthedRequest,
    @Res() res: Response,
  ) {
    const userId = req.user.userId;

    // 设置SSE响应头
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream'); //浏览器识别SSE格式
    res.setHeader('Cache-control', 'no-cache'); //不缓存响应
    res.setHeader('Connection', 'keep-alive'); //保持TCP连接
    res.setHeader('X-Accel-Buffering', 'no'); //禁用Nginx缓冲
    res.setHeader('Access-Control-Allow-Origin', '*'); //如果需要CORS跨域

    // 发送初始注释，保持链接活跃
    res.write(':connected\n\n');
    // flush数据（如果可用
    if (typeof (res as any).flush === 'function') {
      (res as any).flush();
    }

    // 订阅进度事件
    const subscribtion = this.interviewService
      .startMockInterviewWithStream(userId, dto)
      .subscribe({
        next: (event) => {
          res.write(`data:${JSON.stringify(event)}\n\n`);
          // flush数据（如果可用
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
        },
        error: (error) => {
          res.write(
            `data:${JSON.stringify({
              type: 'error',
              error: error.message,
            })}\n\n`,
          );
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
          res.end();
        },
        complete: () => {
          res.end();
        },
      });

    // 客户端断开连接时取消订阅
    req.on('close', () => {
      subscribtion.unsubscribe();
    });
  }

  // 接口3：回答面试问题-SSE流式响应
  @Post('mock/answer')
  @UseGuards(JwtAuthGuard)
  answerMockInterview(
    @Body() dto: AnswerMockInterviewDto,
    @Request() req: AuthedRequest,
    @Res() res: Response,
  ) {
    const userId = req.user.userId;

    // 设置SSE响应头
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream'); //浏览器识别SSE格式
    res.setHeader('Cache-control', 'no-cache'); //不缓存响应
    res.setHeader('Connection', 'keep-alive'); //保持TCP连接
    res.setHeader('X-Accel-Buffering', 'no'); //禁用Nginx缓冲
    res.setHeader('Access-Control-Allow-Origin', '*'); //如果需要CORS跨域

    // 发送初始注释，保持链接活跃
    res.write(':connected\n\n');
    // flush数据（如果可用
    if (typeof (res as any).flush === 'function') {
      (res as any).flush();
    }

    // 订阅进度事件
    const subscribtion = this.interviewService
      .anwserMockInterviewWithStream(userId, dto.sessionId, dto.answer)
      .subscribe({
        next: (event) => {
          res.write(`data:${JSON.stringify(event)}\n\n`);
          // flush数据（如果可用
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
        },
        error: (error) => {
          res.write(
            `data:${JSON.stringify({
              type: 'error',
              error: error.message,
            })}\n\n`,
          );
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
          res.end();
        },
        complete: () => {
          res.end();
        },
      });

    // 客户端断开连接时取消订阅
    req.on('close', () => {
      subscribtion.unsubscribe();
    });
  }

  // 结束面试(用户主动结束)
  @Post('mock/end/:resultId')
  @UseGuards(JwtAuthGuard)
  async endMockInterview(
    @Param('resultId') resultId: string,
    @Request() req: any,
  ) {
    await this.interviewService.endMockInterview(req.user.userId, resultId);

    return ResponseUtil.success({ resultId }, '面试已结束，正在生成分析报告');
  }

  // 暂停面试
  @Post('mock/pause/:resultId')
  @UseGuards(JwtAuthGuard)
  async pauseMockInterview(
    @Param('resultId') resultId: string,
    @Request() req: AuthedRequest,
  ) {
    const result = await this.interviewService.pauseMockInterview(
      req.user.userId,
      resultId,
    );

    return ResponseUtil.success(result, '面试暂停，进度已保存');
  }

  // 恢复面试
  @Post('mock/resume/:resultId')
  @UseGuards(JwtAuthGuard)
  async resumeMockInterview(
    @Param('resultId') resultId: string,
    @Request() req: AuthedRequest,
  ) {
    const result = await this.interviewService.resumeMockInterview(
      req.user.userId,
      resultId,
    );

    return ResponseUtil.success(result, '面试已恢复，可以继续回答');
  }

  // 获取分析报告
  // 统一接口，根据resultId自动识别类型（简历押题、专项面试、综合面试
  @Get('analysis/report/:resultId')
  @UseGuards(JwtAuthGuard)
  async getAnalysisReport(
    @Param('resultId') resultId: string,
    @Request() req: AuthedRequest,
  ) {
    const report = await this.interviewService.getAnalysisReport(
      req.user.userId,
      resultId,
    );
    return ResponseUtil.success(report, '查询成功');
  }

  // 简历分析test
  // @Post('/analyze-resume')
  // async analyzeResume(
  //   @Body() body: { resume: string; jobDescription: string },
  // ) {
  //   const result = await this.interviewService.analyzeResume(
  //     body.resume,
  //     body.jobDescription,
  //   );

  //   return {
  //     code: 200,
  //     data: result,
  //   };
  // }

  // 简历分析
  @Post('/analyze-resume')
  @UseGuards(JwtAuthGuard)
  async analyzeResume(
    @Body() body: { position: string; resume: string; jobDescription: string },
    @Request() req: AuthedRequest,
  ) {
    const result = await this.interviewService.analyzeResume(
      req.user.userId,
      body.position,
      body.resume,
      body.jobDescription,
    );

    return result;
    // return {
    //   code: 200,
    //   data: result,
    // };
  }

  // 继续对话
  @Post('/continue-conversation')
  async continueConversation(
    @Body() body: { sessionId: string; question: string },
  ) {
    const result = await this.interviewService.continueConversation(
      body.sessionId,
      body.question,
    );

    return result;
    // return {
    //   code: 200,
    //   data: {
    //     response: result,
    //   },
    // };
  }
}
