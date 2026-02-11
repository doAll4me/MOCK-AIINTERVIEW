import { PromptTemplate } from '@langchain/core/prompts';
import { Injectable, Logger } from '@nestjs/common';
import { v4 as generateUUID } from 'uuid';
import { Message, SessionDate } from '../interfaces/message.interface';
import { AIModelFactory } from './ai-model.factory';

/**
 * 会话管理服务
 *
 * 这个服务负责管理用户和AI的对话会话。
 *  -维护对话历史(内存存储)
 *  -管理会话的生命周期
 *  -提供会话数据的查询方法
 *
 * 为什么要在AI模块里?
 * 因为对话历史管理是AI交互的核心功能。
 * 任何涉及AI多轮对话的服务(简历分析、出题、评估等)都需要用到它。
 * 所以我们把它放在AI 模块，作为通用服务供所有模块使用。
 */
@Injectable()
export class SessionManager {
  private readonly logger = new Logger(SessionManager.name);

  // 内存存储：sessionId - 对话历史
  private session = new Map<string, SessionDate>();

  constructor(private aiModelFactory: AIModelFactory) {}

  /**
   * 创建新会话
   * @param userId 用户ID
   * @param position 职位名称
   * @param systemMessage 系统消息（AI角色
   * @returns 新建的sessionID（会话id
   */
  createSession(
    userId: string,
    position: string,
    systemMessage: string,
  ): string {
    const sessionId = generateUUID();

    const sessionDate: SessionDate = {
      sessionId,
      userId,
      position,
      message: [{ role: 'system', content: systemMessage }],
      createdAt: new Date(),
      lastActivityAt: new Date(),
    };

    this.session.set(sessionId, sessionDate);
    this.logger.log(
      `创建会话：${sessionId}，用户：${userId}，职位：${position}`,
    );

    return sessionId;
  }

  /**
   * 向会话中添加新的对话消息
   * @param sessionId 会话ID
   * @param role 发送消息的角色（user还是AI
   * @param content 消息内容
   */
  addMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
  ): void {
    const session = this.session.get(sessionId);

    if (!session) throw new Error(`会话不存在：${sessionId}`);

    session.message.push({ role, content });

    session.lastActivityAt = new Date();
    this.logger.debug(`添加消息到会话${sessionId}：${role}`);
  }

  /**
   * 获取完整对话历史
   * @param sessionId 会话ID
   * @returns 对话的完整历史消息
   */
  getHistory(sessionId: string): Message[] {
    const session = this.session.get(sessionId);
    return session?.message || [];
  }

  /**
   * 获取最近n条消息（用于优化token
   *
   * 为什么要这样做?
   * 对话越长，token越多，调用AI的成本越高。
   * 所以我们只保留最近的几条消息，旧的消息可以丢掉。
   * 但注意:System Message(第一条)一定要保留!
   *
   * @param sessionId 会话id
   * @param count 最近消息数量（不包括systemMessage
   * @returns 包含systemMessage+最近的n条消息
   */
  getRecentMessage(sessionId: string, count: number = 10): Message[] {
    const history = this.getHistory(sessionId);

    if (history.length === 0) return [];

    // System Message一定要保留（第一条消息，告诉ai他是什么角色了，比较重要
    const systemMessage = history[0];

    // 获取最近10条消息记录
    const recentMessages = history.slice(-count);

    //如果最近的消息中不包含system message ，就手动加上
    if (recentMessages[0].role !== 'system')
      return [systemMessage, ...recentMessages];

    return recentMessages;
  }

  /**
   * 清理过期会话（1小时未活动
   *
   * 在生产环境中，应该定期调用这个方法来清理内存。
   * 可以用@Cron装饰器在后台定期执行。
   */
  cleanupExpiredSessions(): void {
    const now = new Date();
    const expirationTime = 60 * 60 * 1000; //1小时

    for (const [sessionId, session] of this.session.entries()) {
      if (now.getTime() - session.lastActivityAt.getTime() > expirationTime) {
        this.logger.warn(`清理过期会话：${sessionId}`);
        this.session.delete(sessionId);
      }
    }
  }

  async summarizeLongConversation(
    sessionId: string,
    minMessages: number = 30,
  ): Promise<void> {
    const history = this.getHistory(sessionId);

    // 如果消息少于阈值，则不需要总结
    if (history.length < minMessages) return;

    this.logger.log(
      `开始总结长对话，sessionId：${sessionId}，消息数：${history.length}`,
    );

    // 总结范围：从第二条到倒数第五条（保留最新的5条原始信息
    const conversationToSummarize = history.slice(1, -5);

    // 创建总结prompt
    const summaryPrompt = PromptTemplate.fromTemplate(
      `请总结以下对话的要点。用2-3句话，尽量简洁，保留重要信息。
      
      对话内容：
      {conversation}
      
      总结结果：
      `,
    );

    // 调用AI进行总结
    const model = this.aiModelFactory.createDefaultModel();
    const chain = summaryPrompt.pipe(model);

    try {
      const summary = await chain.invoke({
        conversation: conversationToSummarize
          .map((m) => `${m.role}:${m.content}`)
          .join('\n\n'),
      });

      // 用总结后的内容替换旧的原始消息
      const summaryContent = summary.content || summary;

      const newHistory: Message[] = [
        history[0],
        {
          role: 'system',
          constent: `【之前对话的总结】${summaryContent}`,
        },
        ...history.slice(-5), //保留最新的5条原始消息
      ];

      // 用新的历史替换旧的
      const session = this.session.get(sessionId);
      if (session) {
        session.message = newHistory;
        this.logger.log(
          `总结完成，消息数从${history.length}减少到${newHistory.length}`,
        );
      }
    } catch (error) {
      this.logger.error(`总结对话失败：${error}`);
    }
  }
}
