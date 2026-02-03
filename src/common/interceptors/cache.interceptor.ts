import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable, of, tap } from 'rxjs';

@Injectable()
export class CacheInterceptor<T> implements NestInterceptor<T> {
  private cache = new Map<string, T>();

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<T> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url } = request;

    // 缓存Get请求
    if (method !== 'GET') {
      return next.handle();
    }

    const cacheKey = url;
    const cachedResponse = this.cache.get(cacheKey);

    if (cachedResponse) {
      return of(cachedResponse); //返回緩存
    }

    return next.handle().pipe(
      tap((data) => {
        this.cache.set(cacheKey, data); //缓存响应
      }),
    );
  }
}
