import {
  Body,
  Controller,
  Post,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import type { AuthedRequest } from 'src/auth/jwt-payload.interface';
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

  // 接口1：简历押题
  @Post('resume/quiz/stream')
  @UseGuards(JwtAuthGuard)
  async resumeQuizStream(@Body() dto, @Request() req, @Res() res) {}

  // 接口2：开始模拟面试
  @Post('mock/start')
  @UseGuards(JwtAuthGuard)
  async startMockInterview(@Body() dto, @Request() req) {}

  // 接口3：回答面试问题
  @Post('mock/answer')
  @UseGuards(JwtAuthGuard)
  async answerMockInterview(@Body() dto, @Request() req) {}

  // 接口4：结束面试
  @Post('mock/end')
  @UseGuards(JwtAuthGuard)
  async endMockInterview(@Body() data, @Request() req) {}

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
