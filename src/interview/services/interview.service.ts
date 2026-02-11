// 面试业务服务
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// import { NotFoundException } from '@nestjs/common';
// import { UserService } from 'src/user/user.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Subject } from 'rxjs';
import { User, UserDocument } from 'src/user/user.schema';
import { v4 as uuidv4 } from 'uuid';
import { SessionManager } from '../../ai/services/session.manager';
import { ResumeQuizDto } from '../dto/resume-quiz.dto';
import { ResumeAnalysisResult } from '../interfaces/resume-analysis-result';
import { RESUME_ANALYSIS_SYSTEM_MESSAGE } from '../prompts/resume-analysis.prompts';
import {
  ConsumptionRecord,
  ConsumptionRecordDocument,
  ConsumptionStatus,
  ConsumptionType,
} from '../schemas/consumption-record.schema';
import {
  ResumeQuizResult,
  ResumeQuizResultDocument,
} from '../schemas/interview-quiz-result.schema';
import { ConversationContinuationService } from './conversation-continuation.service';
import { ResumeAnalysisService } from './resume-analysis.service';

type AnalyzeResumeResponse = {
  sessionId: string;
  analysis: ResumeAnalysisResult;
};

type ProgressPayload = {
  type: 'progress' | 'error';
  progress: number;
  label: string;
  message?: string;
  stage?: 'prepare' | 'generating' | 'saving' | 'done';
  error?: string;
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
    @InjectModel(ConsumptionRecord.name)
    private consumptionRecordModel: Model<ConsumptionRecordDocument>,
    @InjectModel(ResumeQuizResult.name)
    private resumeQuizResultModel: Model<ResumeQuizResultDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
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
      const result = (await this.resumeAnalysisService.analyze(
        resumeContent,
        jobDescription,
      )) as ResumeAnalysisResult;

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

  // 执行简历押题
  private async executeResumeQuiz(
    userId: string,
    dto: ResumeQuizDto,
    progressSubject: Subject<ProgressPayload>,
  ): Promise<any> {
    let consumptionRecord: any = null;
    const recordId = uuidv4();
    const resultId = uuidv4();

    try {
      // 0) 先推一次：否则客户端会一直等不到任何输出
      if (!progressSubject.closed) {
        progressSubject.next({
          type: 'progress',
          progress: 1,
          label: '开始处理请求...',
          stage: 'prepare',
        });
      }

      // ====0.幂等性检查=====
      // 防止重复生成
      const existingRecord = await this.consumptionRecordModel.findOne({
        userId,
        'metadata.requestId': dto.requestId,
        status: {
          $in: [ConsumptionStatus.SUCCESS, ConsumptionStatus.PENDING],
        },
      });

      // 如果找到了相同的requestId记录
      if (existingRecord) {
        // 如果之前已经成功了，则直接返回已有的结果
        if (existingRecord.status === ConsumptionStatus.SUCCESS) {
          if (!progressSubject.closed) {
            progressSubject.next({
              type: 'progress',
              progress: 100,
              label: '已存在结果，直接返回缓存',
              stage: 'done',
            });
            progressSubject.complete();
          }

          // 查询之前生成的结果
          const existingResult = await this.resumeQuizResultModel.findOne({
            resultId: existingRecord.resultId,
          });

          // 若不存在 抛出异常
          if (!existingResult) throw new BadRequestException('结果不存在');

          // 若存在之前生成的结果 则直接返回，不再执行后续步骤，不在扣费
          return {
            resultId: existingResult.resultId,
            questions: existingResult.questions,
            summary: existingResult.summary,
            remaininingCount: await this.getRemainingCount(userId, 'resume'),
            consumptionRecordId: existingRecord.recordId,
            // 标记这是从缓存返回的结果
            isFromCache: true,
          };
        }

        if (existingRecord.status === ConsumptionStatus.PENDING) {
          // 同一个请求还在加载中，告诉用户等待
          throw new BadRequestException('请求正在查询中，请稍后');
        }
      }

      // 若没有相同记录，则正常查询扣费
      // =====1.检查并扣除次数（原子操作======
      // this.logger.log(`用户扣费成功`);
      const user = await this.userModel.findOneAndUpdate(
        {
          _id: userId,
          resumeRemainingCount: { $gt: 0 }, //条件：必须余额大于0的时候才可以执行-1
        },
        {
          $inc: { resumeRemainingCount: -1 }, //原子操作：余额-1
        },
        { new: false }, //返回更新前的文档，用于日志记录
      );

      // 检查扣费是否成功
      if (!user)
        throw new BadRequestException('简历押题次数不足，请前往充值购买');

      // 记录详细日志
      this.logger.log(
        `✅️用户扣款成功：userId=${userId}，扣费前=${user.resumeRemainingCount}，扣费后=${user.resumeRemainingCount - 1}`,
      );

      // ✅ 推一次：告诉前端到哪一步了
      // if (!progressSubject.closed) {
      //   progressSubject.next({
      //     type: 'progress',
      //     progress: 20,
      //     label: '已扣费，创建消费记录中...',
      //     stage: 'saving',
      //   });
      // }

      // =====2.创建消费记录=====
      consumptionRecord = await this.consumptionRecordModel.create({
        recordId, //消费记录唯一ID
        user: new Types.ObjectId(userId),
        userId,
        type: ConsumptionType.RESUME_QUIZ, //消费类型
        status: ConsumptionStatus.PENDING, //标记为处理中
        consumedCount: 1, //消费次数
        description: `简历押题 - ${dto?.company} ${dto.positionName}`,

        // 输入参数（用于调试和重现问题
        inputData: {
          company: dto?.company || '',
          positionName: dto.positionName,
          minSalary: dto.minSalary,
          maxSalary: dto.maxSalary,
          jd: dto.jd,
          resumeId: dto.resumeId,
        },
        resultId, //结果ID

        // 元数据（包含幂等性检查的requestId
        metadata: {
          requestId: dto.requestId, //用于幂等性检查
          promptVersion: dto.promptVersion,
        },
        startedAt: new Date(), //记录开始时间
      });
      this.logger.log(`✅️消费记录创建成功：recordId=${recordId}`);

      const aiResult: any = {}; //模拟一个假的结果
      // =====3.保存结果阶段=====
      // 如果没有requestId,或者不存在，则继续执行正常的生成流程
      // ✅ 这里你后面应该会接：调用 AI 生成题目 -> 保存结果 -> 更新 consumptionRecord 状态
      // 目前你还没写，所以我先给一个“假完成”，避免 SSE 永远挂住
      // if (!progressSubject.closed) {
      //   progressSubject.next({
      //     type: 'progress',
      //     progress: 100,
      //     label: '当前仅完成记录创建（后续生成逻辑未实现）',
      //     stage: 'done',
      //   });
      //   progressSubject.complete();
      // }
      // return {
      //   recordId,
      //   resultId,
      //   message: '当前仅完成记录创建（后续生成题目逻辑未实现）',
      // };
      const quizResult = await this.resumeQuizResultModel.create({
        resultId,
        user: new Types.ObjectId(userId),
        userId,
        resumeId: dto.resumeId,
        company: dto?.company,
        position: dto.positionName,
        jobDescription: dto.jd,
        questions: aiResult.questions,
        totalQuestions: aiResult.questions.length,
        summary: aiResult.summary,
        // AI生成的分析报告数据
        matchScore: aiResult.matchScore,
        matchLevel: aiResult.matchLevel,
        matchedSkills: aiResult.matchedSkills,
        missingSkills: aiResult.missingSkills,
        knowledgeGaps: aiResult.knowledgeGaps,
        learningPriorities: aiResult.learningPriorities,
        radarData: aiResult.radarData,
        strengths: aiResult.strengths,
        weaknesses: aiResult.weaknesses,
        interviewTips: aiResult.interviewTips,
        // 元数据
        consumptionRecordId: recordId,
        aiModel: 'deepseek-chat',
        promptVersion: dto.promptVersion || 'v2',
      });

      this.logger.log(`✅️结果保存成功：resultId=${resultId}`);

      // 更新消费记录为成功
      await this.consumptionRecordModel.findByIdAndUpdate(
        consumptionRecord._id,
        {
          $set: {
            status: ConsumptionStatus.SUCCESS,
            outputData: {
              resultId,
              questionCount: aiResult.question.length,
            },
            aiModel: 'deepseek-chat',
            promptTokens: aiResult.usage?.promptTokens,
            completionTokens: aiResult.usage?.completionTokens,
            totalTokens: aiResult.usage?.totalTokens,
            completedAt: new Date(),
          },
        },
      );

      this.logger.log(
        `✅️消费记录已更新为成功状态：record=${consumptionRecord.recordId}`,
      );
    } catch (error) {
      // 错误处理
      //   const msg = error instanceof Error ? error.message : String(error);

      //   // ✅ 出错也要推事件并 complete，否则 SSE 还是会挂
      //   if (!progressSubject.closed) {
      //     progressSubject.next({
      //       type: 'error',
      //       progress: 0,
      //       label: '生成失败',
      //       error: msg,
      //       stage: 'done',
      //     });
      //     progressSubject.complete();
      //   }
      //   throw error;
      // }
      this.logger.error(
        `❌️简历押题生成失败：userId=${userId}，error=${error.message}`,
        error.stack,
      );

      // =====失败回滚流程=====
      try {
        // 1.返还次数（重要！！！）
        this.logger.log(`🔄 开始退还次数：userId=${userId}`);
        await this.refundCount(userId, 'resume');
        this.logger.log(`✅ 次数退还成功：userId=${userId}`);

        // 2.更新消费记录为失败
        if (consumptionRecord) {
          await this.consumptionRecordModel.findByIdAndUpdate(
            consumptionRecord._id,
            {
              $set: {
                status: ConsumptionStatus.FAILED, //标记为失败
                errorMessage: error.message, //记录错误信息
                errorStack:
                  process.env.NODE_ENV === 'development'
                    ? error.stack //开发环境记录堆栈
                    : undefined, //生产环境不记录
                failedAt: new Date(),
                isRefunded: true, //标记为退款
                refundedAt: new Date(),
              },
            },
          );
          this.logger.log(
            `✅️消费记录已更新为失败状态，recordId=${consumptionRecord.recordId}`,
          );
        }
      } catch (refundError) {
        // 退款失败时严重问题，需人工介入
        this.logger.error(
          `🚨 退款流程失败！这是严重问题，需要人工介入！` +
            `userId=${userId}, ` +
            `originalError=${error.message}, ` +
            `refundError=${refundError.message}`,
          refundError.stack,
        );

        // TODO:发送告警通知（钉钉 邮箱等
        // await this.alertService.sendCriticalAlert({
        //   type: 'REFUND_FAILED',
        //   userId,
        //   error: refundError.message,
        // });
      }

      // 3.发送错误事件给前端
      if (progressSubject && !progressSubject.closed) {
        progressSubject.next({
          type: 'error',
          progress: 0,
          label: '❌️生成失败',
          error: error,
        });
        progressSubject.complete();
      }
      throw error;
    }
  }

  // 获取各功能剩余的可使用次数
  private async getRemainingCount(
    userId: string,
    type: 'resume' | 'special' | 'behavior',
  ): Promise<number> {
    const user = await this.userModel.findById(userId);

    if (!user) return 0;

    switch (type) {
      case 'resume':
        return user.resumeRemainingCount;
      case 'special':
        return user.specialRemainingCount;
      case 'behavior':
        return user.behaviorRemainingCount;
      default:
        return 0;
    }
  }

  /**
   * 退还次数（确保在任何失败情况下都能正确退还用户使用次数
   * @param userId 用户ID
   * @param type 退还次数的功能类型
   */
  private async refundCount(
    userId: string,
    type: 'resume' | 'special' | 'behavior',
  ): Promise<void> {
    const field =
      type === 'resume'
        ? 'resumeRemainingCount'
        : type === 'special'
          ? 'specialRemainingCount'
          : 'behaviorRemainingCount';

    // 使用原子操作退还次数
    const result = await this.userModel.findByIdAndUpdate(
      userId,
      {
        $inc: { [field]: 1 },
      },
      { new: true }, //返回更新后的文档
    );

    if (!result) throw new Error(`退款失败：用户不存在 userId=${userId}`);

    this.logger.log(
      `✅️ 次数退还成功:userId=${userId},type=${type}，退还后=${result[field]}`,
    );
  }

  /**
   * 生成简历押题进度(带流式进度)
   * @param userId userId 用户ID
   * @param dto 请求参数
   * @returns Subject 流式事件
   */
  generateResumeQuizWithProgress(
    userId: string,
    dto: ResumeQuizDto,
  ): Subject<ProgressPayload> {
    const subject = new Subject<ProgressPayload>();

    this.executeResumeQuiz(userId, dto, subject).catch((error: unknown) => {
      if (!subject.closed) {
        subject.error(error);
      }
    });

    return subject;
  }
  // /**
  //  * 生成简历押题进度(带流式进度)
  //  * @param userId userId 用户ID
  //  * @param dto 请求参数
  //  * @returns Subject 流式事件
  //  */
  // generateResumeQuizWithProgress(
  //   userId: string,
  //   dto: ResumeQuizDto,
  // ): Subject<ProgressPayload> {
  //   const subject = new Subject<ProgressPayload>();

  //   // 异步执行，通过subject发送进度
  //   this.executeResumeQuiz(userId, dto, subject).catch((error) => {
  //     subject.error(error);
  //   });

  //   return subject;
  // }

  // private delay(ms: number): Promise<void> {
  //   return new Promise((resolve) => setTimeout(resolve, ms));
  // }

  // private async executeResumeQuiz(
  //   userId: string,
  //   dto: ResumeQuizDto,
  //   progressSubject: Subject<ProgressPayload>,
  // ): Promise<any> {
  //   // 处理错误
  //   try {
  //     // 定义不同阶段的提示信息
  //     const progressMessages = [
  //       // 0-20%：理解阶段
  //       { progress: 0.05, message: '🤖 AI 正在深度理解您的简历内容...' },
  //       { progress: 0.1, message: '📊 AI 正在分析您的技术栈和项目经验...' },
  //       { progress: 0.15, message: '🔍 AI 正在识别您的核心竞争力...' },
  //       { progress: 0.2, message: '📄 AI 正在对比岗位要求与您的背景...' },

  //       // 20-50%：设计问题阶段
  //       { progress: 0.25, message: '💡 AI 正在设计针对性的技术问题...' },
  //       { progress: 0.3, message: '🎯 AI 正在挖掘您简历中的项目亮点...' },
  //       { progress: 0.35, message: '🧠 AI 正在构思场景化的面试问题...' },
  //       { progress: 0.4, message: '⚡ AI 正在设计不同难度的问题组合...' },
  //       { progress: 0.45, message: '🔬 AI 正在分析您的技术深度和广度...' },
  //       { progress: 0.5, message: '📝 AI 正在生成基于 STAR 法则的答案...' },

  //       // 50-70%：优化阶段
  //       { progress: 0.55, message: '✨ AI 正在优化问题的表达方式...' },
  //       { progress: 0.6, message: '🎨 AI 正在为您准备回答要点和技巧...' },
  //       { progress: 0.65, message: '💎 AI 正在提炼您的项目成果和亮点...' },
  //       { progress: 0.7, message: '🔧 AI 正在调整问题难度分布...' },

  //       // 70-85%：完善阶段
  //       { progress: 0.75, message: '📚 AI 正在补充技术关键词和考察点...' },
  //       { progress: 0.8, message: '🎓 AI 正在完善综合评估建议...' },
  //       { progress: 0.85, message: '🚀 AI 正在做最后的质量检查...' },
  //       { progress: 0.9, message: '✅ AI 即将完成问题生成...' },
  //     ];

  //     //逐条推送进度（每秒一次）
  //     //  模拟一个定时器，没间隔一秒响应一次数据
  //     let progress = 0;
  //     let currentMessage = progressMessages[0];

  //     const interval = setInterval(() => {
  //       progress += 1;
  //       const next = progressMessages[progress];
  //       if (!next) return;
  //       currentMessage = next;

  //       // 发送进度事件
  //       this.emitProgress(
  //         progressSubject,
  //         Math.round(currentMessage.progress * 100),
  //         currentMessage.message,
  //         'generating',
  //       );
  //       // 简单处理，到了progressMessages的length就结束进程了
  //       if (progress === progressMessages.length - 1) {
  //         clearInterval(interval);

  //         this.emitProgress(progressSubject, 100, 'AI已完成问题生成', 'done');
  //         // 结束推送
  //         if (!progressSubject.closed) {
  //           progressSubject.complete();
  //         }
  //         return {
  //           questions: [],
  //           analysis: [],
  //         };
  //       }
  //     }, 1000);
  //   } catch (error: unknown) {
  //     if (progressSubject && !progressSubject.closed) {
  //       progressSubject.next({
  //         type: 'error',
  //         progress: 0,
  //         label: '❌️生成失败',
  //         error: error instanceof Error ? error.message : String(error),
  //       });
  //       progressSubject.complete();
  //     }
  //     throw error;
  //   }
  // }

  // private emitProgress(
  //   subject: Subject<ProgressPayload> | undefined,
  //   progress: number,
  //   label: string,
  //   stage?: 'prepare' | 'generating' | 'saving' | 'done',
  // ): void {
  //   if (subject && !subject.closed) {
  //     subject.next({
  //       type: 'progress',
  //       progress: Math.min(Math.max(progress, 0), 100), //确保在0-100之间
  //       label,
  //       message: label,
  //       stage,
  //     });
  //   }
  // }
}
