// 面试业务服务
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIModelFactory } from 'src/ai/services/ai-model.factory';
// import { NotFoundException } from '@nestjs/common';
// import { UserService } from 'src/user/user.service';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import { RESUME_QUIZ_PROMPT } from '../prompts/resume-quiz.prompts';

/**
 * 面试服务
 *
 * 这个服务处理与面试相关的业务逻辑。
 * 它依赖于AIModelFactory 来获取 AI 模型，而不是自己初始化模型。
 * 好处:
 * -关注点分离:InterviewService 只关心业务逻辑，AI 模型的初始化交给 AIModelFactory
 * -易于切换:如果以后要换 AI 模型，只需要改 AIModelFactory，InterviewService 不用改
 * -易于测试:可以mock AIModelFactory，不用真实调用 API
 */
@Injectable()
export class InterviewService {
  // constructor(private readonly userService: UserService) {} //注入用户服务
  private readonly logger = new Logger(InterviewService.name);

  constructor(
    private configService: ConfigService,
    private aiModelFactory: AIModelFactory, //注入AI模型工厂
  ) {}

  // async createInterview(userId: number, interviewData: any) {
  //   //验证用户是否存在
  //   const user = this.userService.findOne(userId);
  //   if (!user) {
  //     throw new NotFoundException(`用户不存在`);
  //   }

  //   // 创建面试记录
  // }

  // // 初始化模型
  // private initializeModel(temperature: number = 0.7) {
  //   const apiKey = this.configService.get<string>('DEEPSEEK_API_KEY');

  //   if (!apiKey) throw new Error('DEEPSEEK_API_KEY不存在');

  //   return new ChatDeepSeek({
  //     apiKey: apiKey,
  //     model: 'deepseek-chat',
  //     temperature: temperature,
  //     maxTokens: 4000,
  //   });
  // }

  // // 使用模型
  // async someMethod() {
  //   const model = this.initializeModel(0.7);
  // }

  async analyzeResume(
    resumeContent: string,
    jobDescription: string,
  ): Promise<unknown> {
    //创建prompt模版
    const prompt = PromptTemplate.fromTemplate(RESUME_QUIZ_PROMPT);

    // 通过工厂获取模型（不用自己重复初始化
    const model = this.aiModelFactory.createDefaultModel();

    // 创建输出解析器
    const parser = new JsonOutputParser();

    // 创建链：prompt->模型->解析器
    const chain = prompt.pipe(model).pipe(parser);

    // 调用链
    try {
      this.logger.log('开始简历分析');

      const result = await chain.invoke({
        resume_content: resumeContent,
        job_description: jobDescription,
      });

      this.logger.log('简历分析完成');
      return result;
    } catch (error) {
      this.logger.error(
        '简历分析失败',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
