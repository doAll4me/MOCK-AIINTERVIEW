// 面试业务服务
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// import { NotFoundException } from '@nestjs/common';
// import { UserService } from 'src/user/user.service';
import { SessionManager } from '../../ai/services/session.manager';
import { ResumeAnalysisResult } from '../interfaces/resumeAnalysisResult';
import { RESUME_ANALYSIS_SYSTEM_MESSAGE } from '../prompts/resume-analysis.prompts';
import { ConversationContinuationService } from './conversation-continuation.service';
import { ResumeAnalysisService } from './resume-analysis.service';

type AnalyzeResumeResponse = {
  sessionId: string;
  analysis: ResumeAnalysisResult;
};

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
    // private aiModelFactory: AIModelFactory, //注入AI模型工厂
    private sessionManager: SessionManager,
    private resumeAnalysisService: ResumeAnalysisService,
    private conversationContinuationService: ConversationContinuationService,
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

  // 分析简历test
  // async analyzeResume(
  //   resumeContent: string,
  //   jobDescription: string,
  // ): Promise<unknown> {
  //   //创建prompt模版
  //   const prompt = PromptTemplate.fromTemplate(RESUME_QUIZ_PROMPT);

  //   // 通过工厂获取模型（不用自己重复初始化
  //   const model = this.aiModelFactory.createDefaultModel();

  //   // 创建输出解析器
  //   const parser = new JsonOutputParser();

  //   // 创建链：prompt->模型->解析器
  //   const chain = prompt.pipe(model).pipe(parser);

  //   // 调用链
  //   try {
  //     this.logger.log('开始简历分析');

  //     const result = await chain.invoke({
  //       resume_content: resumeContent,
  //       job_description: jobDescription,
  //     });

  //     this.logger.log('简历分析完成');
  //     return result;
  //   } catch (error) {
  //     this.logger.error(
  //       '简历分析失败',
  //       error instanceof Error ? error.stack : String(error),
  //     );
  //     throw error;
  //   }
  // }

  /**
   * 分析简历(首轮，创建会话)
   *
   * @param userId 用户 ID
   * @param position 职位名称
   * @param resumeContent 简历内容
   * @param jobDescription 岗位要求
   * @returns 分析结果和 sessionId
   */
  async analyzeResume(
    userId: string,
    position: string,
    resumeContent: string,
    jobDescription: string,
  ): Promise<AnalyzeResumeResponse> {
    try {
      // 1.创建新会话
      const systemMessage = RESUME_ANALYSIS_SYSTEM_MESSAGE(position);
      const sessionId = this.sessionManager.createSession(
        userId,
        position,
        systemMessage,
      );

      this.logger.log(`创建会话：${sessionId}`);

      // 2.调用专门的简历分析服务
      const result: unknown = await this.resumeAnalysisService.analyze(
        resumeContent,
        jobDescription,
      );

      // 测试
      this.logger.log(
        `resumeAnalysisService.analyze() returned: ${JSON.stringify(result)}`,
      );
      if (result == null) {
        // null 或 undefined 都会进来
        throw new Error(
          'resumeAnalysisService.analyze() 没有返回结果（null/undefined）',
        );
      }

      // 3.保存用户输入到会话历史
      this.sessionManager.addMessage(
        sessionId,
        'user',
        `简历内容：${resumeContent}`,
      );

      // 4.保存AI回答到会话历史
      this.sessionManager.addMessage(
        sessionId,
        'assistant',
        JSON.stringify(result),
      );

      this.logger.log(`简历分析完成，sessionId:${sessionId}`);

      return { sessionId, analysis: result };
    } catch (error) {
      this.logger.error('分析简历失败', error);
      throw error;
    }
  }

  /**
   * 继续对话(多轮，基于现有会话)
   *
   * @param sessionId 会话 ID
   * @param userQusetion 用户问题
   * @returns AI 的回答
   */
  async continueConversation(
    sessionId: string,
    userQusetion: string,
  ): Promise<string> {
    try {
      // 1.添加用户问题到回话历史中
      this.sessionManager.addMessage(sessionId, 'user', userQusetion);

      // 2.获取对话历史
      const history = this.sessionManager.getRecentMessage(sessionId, 10);

      this.logger.log(
        `继续对话，sessionId:${sessionId}，历史消息数：${history.length}`,
      );

      // 3.调用专门的对话继续服务
      const aiResponse =
        await this.conversationContinuationService.continue(history);

      // 4.保存AI的回答到会话历史中，方便下一轮对话
      this.sessionManager.addMessage(sessionId, 'assistant', aiResponse);

      this.logger.log(`对话继续完成，sessionId:${sessionId}`);

      return aiResponse;
    } catch (error) {
      this.logger.error(`继续对话失败：${error}`);
      throw error;
    }
  }
}
