import { Module } from '@nestjs/common';
import { AIModelFactory } from './services/ai-model.factory';

/**
 * AI 模块
 *
 * 这个模块集中管理所有的AI相关服务。
 * 目前只有 AIModelFactory 服务。
 */
@Module({
  providers: [AIModelFactory],
  exports: [AIModelFactory],
})
export class AIModule {}
