import { ChatDeepSeek } from '@langchain/deepseek';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * AI模型工厂服务
 * 这个服务负责初始化和管理AI 模型。
 * 所有的模型初始化逻辑都集中在这里。
 *
 * 好处:
 * 集中管理:所有模型配置都在一个地方
 * 易于切换:以后要换模型(比如从DeepSeek换成openAI)，只需要改这个文件
 * 易于复用:任何服务都可以使用这个工厂来获取模型
 * 易于测试:可以单独测试模型初始化逻辑
 * 如何在其他服务中使用?
 * @Injectable()
 * export class QuizService {
 *  constructor(
 *    private aiModelFactory: AIModelFactory)
 *  ){}
 *
 *  async generateQuiz() {
 *    const model = this.aiModelFactory.createDefaultModel();
 *    //使用 mode
 *  }
 * }
 */
@Injectable()
export class AIModelFactory {
  private readonly logger = new Logger(AIModelFactory.name);

  constructor(private configService: ConfigService) {}

  /**
   * 创建默认的AI 模型
   * 这是最常用的模型初始化方法。
   * 返回一个配置好的chatDeepSeek 实例。
   * 参数都来自环境变量，这样可以根据部署环境灵活配置:
   *  -DEEPSEEK_API_KEY:API 密钥
   *  -DEEPSEEK_MODEL: 模型名称 (deepseek-chat 或 deepseek-reasoner)
   *  -DEEPSEEK_TEMPERATURE:温度参数(控制随机性
   *  -DEEPSEEK MAX TOKENS:最大Token 数
   */
  createDefaultModel(): ChatDeepSeek {
    const apiKey = this.configService.get<string>('DEEPSEEK_API_KEY');

    if (!apiKey) this.logger.warn('DEEPSEEK_API_KEY不存在');

    return new ChatDeepSeek({
      apiKey: apiKey || 'dummy-key',
      // deepseek-reasoner:思考模式(慢，适合需要深度推理的任务，如数学、逻辑题)
      // deepseek-chat:非思考模式(快，适合内容生成任务，如面试问题、文案创作)
      // 对于生成面试问题，使用deepseek-chat 更快(10-30秒)，reasoner会超时(5-10分钟)
      model:
        this.configService.get<string>('DEEPSEEK_MODEL') || 'deepseek-chat',
      temperature: Number(
        this.configService.get<string>('DEEPSEEK_TEMPERATURE') || '0.7',
      ),
      maxTokens: Number(
        this.configService.get<string>('DEEPSEEK_MAX_TOKEN') || '4000',
      ),
    });
  }

  /**
   * 创建用于稳定输出的模型(评估场景)
   *
   * 有些场景需要AI的输出更稳定、更一致(比如评估答案、打分)。
   * 这个方法创建一个temperature 较低的模型。
   */
  createStableModel(): ChatDeepSeek {
    const baseModel = this.createDefaultModel();
    return new ChatDeepSeek({
      apiKey: this.configService.get<string>('DEEPSEEK_API_KEY') || 'dummy-key',
      model: baseModel.model,
      temperature: 0.3, //越低越稳定
      maxTokens: 4000,
    });
  }

  /**
   * 创建用于创意输出的模型(生成场景)
   * 有些场景需要AI的输出更多样化、更有创意(比如生成题目、生成文案)。
   * 这个方法创建一个temperature较高的模型。
   */
  createCreativeModel(): ChatDeepSeek {
    const baseModel = this.createDefaultModel();
    return new ChatDeepSeek({
      apiKey: this.configService.get<string>('DEEPSEEK_API_KEY') || 'dummy-key',
      model: baseModel.model,
      temperature: 0.8,
      maxTokens: 4000,
    });
  }
}
