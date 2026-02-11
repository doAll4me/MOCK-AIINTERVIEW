// 会话对话服务

import { PromptTemplate } from '@langchain/core/prompts';
import { Injectable, Logger } from '@nestjs/common';
import { Message } from 'src/ai/interfaces/message.interface';
import { AIModelFactory } from '../../ai/services/ai-model.factory';
import { CONVERSATION_CONTINUATION_PROMPT } from '../prompts/resume-analysis.prompts';

/**
 * 对话继续服务
 *
 * 这个服务负责在已有的对话历史基础上，继续对话的AIchain。
 */
@Injectable()
export class ConversationContinuationService {
  private readonly logger = new Logger(ConversationContinuationService.name);

  constructor(private aiModelFactory: AIModelFactory) {}

  /**
   * 基于历史进行继续对话
   *
   * @param history 会话历史消息
   * @returns ai回答内容
   */
  async continue(history: Message[]): Promise<string> {
    // 1.创建prompt模版
    const prompt = PromptTemplate.fromTemplate(
      CONVERSATION_CONTINUATION_PROMPT,
    );

    // 2.获取模型
    const model = this.aiModelFactory.createDefaultModel();

    // 3.组建链
    const chain = prompt.pipe(model);

    try {
      this.logger.log(`继续对话，历史消息数：${history.length}`);

      // 4.调用链
      const response = await chain.invoke({
        history: history.map((m) => `${m.role}:${m.content}`).join('\n\n'),
      });

      // 5.获取回答内容
      const aiResponse = response.content as string;

      this.logger.log('对话继续完成');
      return aiResponse;
    } catch (error) {
      this.logger.error('继续对话失败', error);
      throw error;
    }
  }
}
