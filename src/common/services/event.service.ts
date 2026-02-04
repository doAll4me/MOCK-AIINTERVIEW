import { Injectable } from '@nestjs/common';
import { interval, map, Observable, Subject, tap } from 'rxjs';

@Injectable()
export class EventService {
  // 创建一个subject用来广播事件, 是一个“可手动推送的流”
  // Subject = Observable + Observer既能 .next() 推数据 又能被别人 .subscribe() 监听
  private eventSubject = new Subject<string>();

  // 手动向流里发事件
  emit(message: string) {
    this.eventSubject.next(message);
  }

  // 获取事件流的Observable
  getEvents(): Observable<string> {
    return this.eventSubject.asObservable(); //只暴露“可订阅视角”,外部只能 subscribe, 外部不能 .next()
  }

  // 一个“自动产生消息的流”(一个“冷 Observable”)
  generateTimedMessages(): Observable<string> {
    return interval(1000).pipe(
      map((count) => `这是第${count + 1}条信息`),
      tap((message) => {
        console.log('推送信息:', message);
      }),
    );
  }
}
