import { Controller, Sse } from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { EventService } from 'src/common/services/event.service';

@Controller('interview')
export class InterviewController {
  // 注入事件流来源
  constructor(private readonly eventService: EventService) {}

  /**
   *  定义了一个 SSE（Server-Sent Events）流式接口，完整路径是：GET  /interview/stream
   * 让客户端通过一次 HTTP 请求，持续不断地从服务器接收消息流。
   */
  @Sse('stream')
  // 这个接口返回的不是一个结果，而是一条 Observable 流
  stream(): Observable<MessageEvent> {
    return this.eventService.generateTimedMessages().pipe(
      // 把“普通消息”包装成 SSE 格式
      map(
        (message) =>
          ({
            data: JSON.stringify({
              timestamp: new Date().toISOString(),
              message: message,
            }),
          }) as MessageEvent,
      ),
    );
  }
}
