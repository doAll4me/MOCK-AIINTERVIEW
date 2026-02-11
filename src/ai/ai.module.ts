import { Module } from '@nestjs/common';
import { AIModelFactory } from './services/ai-model.factory';
import { SessionManager } from './services/session.manager';

/**
 * AI 模块
 *
 * 这个模块集中管理所有的AI相关服务。
 *  -AIModelFactory:AI模型工厂(初始化模型)
 *  -SessionManager:会话管理(管理对话历史)
 *
 * 任何需要用到AI的模块，都应该导入这个AIModule。
 */
@Module({
  providers: [AIModelFactory, SessionManager],
  exports: [AIModelFactory, SessionManager],
})
export class AIModule {}
