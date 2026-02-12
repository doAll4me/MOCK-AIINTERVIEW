// 面试业务服务
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// import { NotFoundException } from '@nestjs/common';
// import { UserService } from 'src/user/user.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Subject } from 'rxjs';
import { User, UserDocument } from 'src/user/user.schema';
import { v4 as uuidv4 } from 'uuid';
import { SessionManager } from '../../ai/services/session.manager';
import {
  MockInterviewEventDto,
  MockInterviewEventType,
  MockInterviewType,
  StartMockInterviewDto,
} from '../dto/mock-interview.dto';
import { ResumeQuizDto } from '../dto/resume-quiz.dto';
import { ResumeAnalysisResult } from '../interfaces/resume-analysis-result';
import { RESUME_ANALYSIS_SYSTEM_MESSAGE } from '../prompts/resume-analysis.prompts';
import {
  AIInterviewResult,
  AIInterviewResultDocument,
} from '../schemas/ai-interview-result.schema';
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
import { DocumentParserService } from './document-parser.service';
import { InterviewAIService } from './interview-ai.service';
import { ResumeAnalysisService } from './resume-analysis.service';

// 简历分析提取结果的输出格式
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

  // 测试
  result?: any;
  isFromCache?: boolean;
};

export interface ProgressEvent {
  type: 'progress' | 'complete' | 'error';
  progress: number;
  label?: string;
  message?: string;
  data?: any;
}

/**
 * 模拟面试事件
 * 描述一次模拟面试过程中的各种事件信息，包括面试的状态、提问进度、错误信息等。
 */
export interface MockInterviewEvent {
  type: MockInterviewEventType; // 事件类型，参考 MockInterviewEventType 枚举，表示当前事件的种类（如提问、错误等）
  sessionId?: string; // 面试会话的唯一标识符（可选），与 InterviewSession 中的 sessionId 对应
  interviewerName?: string; // 面试官的姓名（可选）
  content?: string; // 事件的内容，可能是问题的内容或其他描述信息（可选）
  questionNumber?: number; // 当前提问的题号（可选）
  totalQuestions?: number; // 面试的总问题数量（可选）
  elapsedMinutes?: number; // 已经过的面试时间（单位：分钟， 可选）
  error?: string; // 错误信息（可选），如果发生错误则返回错误描述
  resultId?: string; // 结果ID（可选），与面试结果相关联，通常用于保存或查询结果
  isStreaming?: boolean; // 是否正在进行流式传输（可选），如果正在传输面试内容时为 true
  metadata?: Record<string, any>; // 额外的元数据（可选），可以用于存储其他额外信息
}

// 面试会话状态，描述一次面试会话的各项信息，包括候选人、面试官、职位信息、会话历史记录等。
interface InterviewSession {
  sessionId: string; // 面试会话的唯一标识符
  userId: string; // 用户的唯一标识符，通常是候选人的ID
  interviewType: MockInterviewType; // 面试类型，参考 MockInterviewType 枚举
  interviewerName: string; // 面试官的姓名
  candidateName?: string; // 候选人的姓名（可选）
  company?: string; // 面试公司名称（可选）
  positionName?: string; // 面试的职位名称（可选）
  salaryRange?: string; // 该职位的薪资范围（可选）
  jd?: string; // 职位的招聘描述（可选）
  resumeContent: string; // 候选人的简历内容
  conversationHistory: Array<{
    role: 'interviewer' | 'candidate'; // 发言者角色，区分面试官或候选人
    content: string; // 发言内容
    timestamp: Date; // 发言的时间戳
    standardAnswer?: string; // 面试官问题的标准答案（仅面试官提问时有）
  }>;
  questionCount: number; // 面试中问题的数量
  startTime: Date; // 面试开始的时间
  targetDuration: number; // 目标时长，单位为分钟，面试预计持续的时间
  isActive: boolean; // 是否为当前进行中的面试会话
  // 实时保存相关
  resultId?: string; // 结果ID，首次保存面试结果时生成
  consumptionRecordId?: string; // 消费记录ID，记录用户消费信息
}

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
  private interviewSessions: Map<string, InterviewSession> = new Map();

  constructor(
    private configService: ConfigService,
    // private aiModelFactory: AIModelFactory, //注入AI模型工厂
    private sessionManager: SessionManager,
    private resumeAnalysisService: ResumeAnalysisService,
    private documentParserService: DocumentParserService,
    private aiService: InterviewAIService,
    private conversationContinuationService: ConversationContinuationService,
    @InjectModel(ConsumptionRecord.name)
    private consumptionRecordModel: Model<ConsumptionRecordDocument>,
    @InjectModel(ResumeQuizResult.name)
    private resumeQuizResultModel: Model<ResumeQuizResultDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    @InjectModel(AIInterviewResult.name)
    private aiInterviewResultModel: Model<AIInterviewResultDocument>,
  ) {}

  // 面试时长限制
  private readonly SPECIAL_INTERVIEW_MAX_DURATION = 120;
  private readonly BEHAVIOR_INTERVIEW_MAX_DURATION = 120;

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
      // if (!progressSubject.closed) {
      //   progressSubject.next({
      //     type: 'progress',
      //     progress: 1,
      //     label: '开始处理请求...',
      //     stage: 'prepare',
      //   });
      // }

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
          // 查询之前生成的结果
          const existingResult = await this.resumeQuizResultModel.findOne({
            resultId: existingRecord.resultId,
          });

          // 若不存在 抛出异常
          if (!existingResult) throw new BadRequestException('结果不存在');

          if (!progressSubject.closed) {
            progressSubject.next({
              type: 'progress',
              progress: 100,
              label: '已存在结果，直接返回缓存',
              message: '已存在结果，直接返回缓存',
              stage: 'done',
              isFromCache: true,
              result: {
                resultId: existingResult.resultId,
                questions: existingResult.questions,
                summary: existingResult.summary,
                remaininingCount: await this.getRemainingCount(
                  userId,
                  'resume',
                ),
                consumptionRecordId: existingRecord.recordId,
              },
            });
            progressSubject.complete();
          }

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

      // ======阶段1：准备阶段（0-10%）=====
      this.emitProgress(progressSubject, 0, '📃正在读取简历...');

      this.logger.log(`✍️开始提取简历内容：resumeId=${dto.resumeId}`);
      const resumeContent = await this.extractResumeContent(userId, dto);
      this.logger.log(`✅️简历内容提取成功：长度=${resumeContent.length}字符`);
      // for (let i = 0; i < resumeContent.length; i += 400) {
      //   this.logger.log(
      //     `📄简历内容[${i}-${Math.min(i + 400, resumeContent.length)}]: ${resumeContent.slice(i, i + 400)}`,
      //   );
      // }

      this.emitProgress(progressSubject, 5, '✅️简历解析完成');
      this.emitProgress(progressSubject, 10, '🚀准备就绪，即将开始AI生成');

      // =====阶段2：AI生成阶段（10-90%）=====
      const aiStartTime = Date.now();

      this.logger.log('🤖开始生成押题部分...');
      this.emitProgress(
        progressSubject,
        15,
        '🤖AI正在理解您的简历内容并生成面试问题...',
      );

      this.startGeneratingProgress(progressSubject);

      // 第一步：生成押题部分
      const questionResult =
        await this.aiService.generateResumeQuizQuestionsOnly({
          company: dto?.company || '',
          positionName: dto.positionName,
          minSalary: dto.minSalary,
          maxSalary: dto.maxSalary,
          jd: dto.jd,
          resumeContent,
        });

      this.logger.log(
        `✅️押题部分生成完成：问题数=${questionResult.questions?.length || 0}`,
      );

      this.emitProgress(
        progressSubject,
        50,
        '✅️面试问题生成完成，开始分析匹配度...',
      );

      // 第二步：生成匹配度分析
      this.logger.log('🤖开始生成匹配度分析...');
      this.emitProgress(progressSubject, 60, '🤖AI正在分析您与岗位的匹配度...');

      const analysisResult =
        await this.aiService.generateResumeQuizAnalysisOnly({
          company: dto?.company || '',
          positionName: dto.positionName,
          minSalary: dto.minSalary,
          maxSalary: dto.maxSalary,
          jd: dto.jd,
          resumeContent,
        });

      this.logger.log(`✅️匹配度分析完成`);

      const aiDuration = Date.now() - aiStartTime;
      this.logger.log(
        `⏰️AI总耗时：${aiDuration}ms (${(aiDuration / 1000).toFixed(1)}秒)`,
      );

      // 合并两部分结果
      const aiResult = { ...questionResult, ...analysisResult };

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
      // const quizResult = await this.resumeQuizResultModel.create({
      //   resultId,
      //   user: new Types.ObjectId(userId),
      //   userId,
      //   resumeId: dto.resumeId,
      //   company: dto?.company,
      //   position: dto.positionName,
      //   jobDescription: dto.jd,
      //   questions: aiResult.questions,
      //   totalQuestions: aiResult.questions.length,
      //   summary: aiResult.summary,
      //   // AI生成的分析报告数据
      //   matchScore: aiResult.matchScore,
      //   matchLevel: aiResult.matchLevel,
      //   matchedSkills: aiResult.matchedSkills,
      //   missingSkills: aiResult.missingSkills,
      //   knowledgeGaps: aiResult.knowledgeGaps,
      //   learningPriorities: aiResult.learningPriorities,
      //   radarData: aiResult.radarData,
      //   strengths: aiResult.strengths,
      //   weaknesses: aiResult.weaknesses,
      //   interviewTips: aiResult.interviewTips,
      //   // 元数据
      //   consumptionRecordId: recordId,
      //   aiModel: 'deepseek-chat',
      //   promptVersion: dto.promptVersion || 'v2',
      // });

      // this.logger.log(`✅️结果保存成功：resultId=${resultId}`);

      // 更新消费记录为成功
      await this.consumptionRecordModel.findByIdAndUpdate(
        consumptionRecord._id,
        {
          $set: {
            status: ConsumptionStatus.SUCCESS,
            outputData: {
              resultId,
              questionCount: aiResult.questions.length,
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

      // =====阶段4：返回结果=====
      const result = {
        resultId: resultId,
        questions: questionResult.questions,
        summary: questionResult.summary,
        // 匹配度分析数据
        matchScore: analysisResult.matchScore,
        matchLevel: analysisResult.matchLevel,
        matchedSkills: analysisResult.matchedSkills,
        missingSkills: analysisResult.missingSkills,
        knowledgeGaps: analysisResult.knowledgeGaps,
        learningPriorities: analysisResult.learningPriorities,
        radarData: analysisResult.radarData,
        strengths: analysisResult.strengths,
        weaknesses: analysisResult.weaknesses,
        interviewTips: analysisResult.interviewTips,
      };

      // 发送完成事件
      this.emitComplete(progressSubject, result);
      this.emitProgress(
        progressSubject,
        100,
        `✅️所有分析完成，正在保存结果...响应数据为${JSON.stringify(result)}`,
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

  // private async executeResumeQuiz(
  //   userId: string,
  //   dto: ResumeQuizDto,
  //   progressSubject: Subject<ProgressPayload>,
  // ): Promise<any> {
  //   // 处理错误
  //   try {
  //     // 定义不同阶段的提示信息
  //     // const progressMessages = [
  //     //   // 0-20%：理解阶段
  //     //   { progress: 0.05, message: '🤖 AI 正在深度理解您的简历内容...' },
  //     //   { progress: 0.1, message: '📊 AI 正在分析您的技术栈和项目经验...' },
  //     //   { progress: 0.15, message: '🔍 AI 正在识别您的核心竞争力...' },
  //     //   { progress: 0.2, message: '📄 AI 正在对比岗位要求与您的背景...' },

  //     //   // 20-50%：设计问题阶段
  //     //   { progress: 0.25, message: '💡 AI 正在设计针对性的技术问题...' },
  //     //   { progress: 0.3, message: '🎯 AI 正在挖掘您简历中的项目亮点...' },
  //     //   { progress: 0.35, message: '🧠 AI 正在构思场景化的面试问题...' },
  //     //   { progress: 0.4, message: '⚡ AI 正在设计不同难度的问题组合...' },
  //     //   { progress: 0.45, message: '🔬 AI 正在分析您的技术深度和广度...' },
  //     //   { progress: 0.5, message: '📝 AI 正在生成基于 STAR 法则的答案...' },

  //     //   // 50-70%：优化阶段
  //     //   { progress: 0.55, message: '✨ AI 正在优化问题的表达方式...' },
  //     //   { progress: 0.6, message: '🎨 AI 正在为您准备回答要点和技巧...' },
  //     //   { progress: 0.65, message: '💎 AI 正在提炼您的项目成果和亮点...' },
  //     //   { progress: 0.7, message: '🔧 AI 正在调整问题难度分布...' },

  //     //   // 70-85%：完善阶段
  //     //   { progress: 0.75, message: '📚 AI 正在补充技术关键词和考察点...' },
  //     //   { progress: 0.8, message: '🎓 AI 正在完善综合评估建议...' },
  //     //   { progress: 0.85, message: '🚀 AI 正在做最后的质量检查...' },
  //     //   { progress: 0.9, message: '✅ AI 即将完成问题生成...' },
  //     // ];

  //     //逐条推送进度（每秒一次）
  //     //  模拟一个定时器，没间隔一秒响应一次数据
  //     // let progress = 0;
  //     // let currentMessage = progressMessages[0];

  //     // const interval = setInterval(() => {
  //     // progress += 1;
  //     // const next = progressMessages[progress];
  //     // if (!next) return;
  //     // currentMessage = next;

  //     // 发送进度事件
  //     this.emitProgress(progressSubject, 0, '📃正在读取简历文档...', 'prepare');
  //     this.logger.log(`✍️开始提取简历内容：resumeId=${dto.resumeId}`);
  //     const resumeContent = await this.extractResumeContent(userId, dto);
  //     this.logger.log(`✅️简历内容提取成功：长度=${resumeContent.length}字符`);

  //     this.emitProgress(progressSubject, 5, '✅️简历解析完成', 'prepare');
  //     // 简单处理，到了progressMessages的length就结束进程了
  //     //   if (progress === progressMessages.length - 1) {
  //     //     clearInterval(interval);

  //     //     this.emitProgress(progressSubject, 100, 'AI已完成问题生成', 'done');
  //     //     // 结束推送
  //     //     if (!progressSubject.closed) {
  //     //       progressSubject.complete();
  //     //     }
  //     //     return {
  //     //       questions: [],
  //     //       analysis: [],
  //     //     };
  //     //   }
  //     // }, 1000);
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

  //   this.executeResumeQuiz(userId, dto, subject).catch((error: unknown) => {
  //     if (!subject.closed) {
  //       subject.error(error);
  //     }
  //   });

  //   return subject;
  // }

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

    // 异步执行，通过subject发送进度
    this.executeResumeQuiz(userId, dto, subject).catch(() => {});

    return subject;
  }

  // private delay(ms: number): Promise<void> {
  //   return new Promise((resolve) => setTimeout(resolve, ms));
  // }

  // 发送进度事件
  private emitProgress(
    subject: Subject<ProgressPayload> | undefined,
    progress: number,
    label: string,
  ): void {
    if (subject && !subject.closed) {
      subject.next({
        type: 'progress',
        progress: Math.min(Math.max(progress, 0), 100), //确保在0-100之间
        label,
        message: label,
      });
    }
  }

  // 发送完成事件
  private emitComplete(
    subject: Subject<ProgressEvent> | undefined,
    data: any,
  ): void {
    if (subject && subject.closed) {
      subject.next({
        type: 'complete',
        progress: 100,
        label: '🎉生成完成！',
        message: '生成完成',
        data,
      });
      subject.complete();
    }
  }

  // 不同阶段的提示信息
  private startGeneratingProgress(subject: Subject<ProgressPayload>) {
    let progress = 1;

    const messages = [
      '📊 AI 正在分析您的技术栈和项目经验...',
      '🔍 AI 正在识别您的核心竞争力...',
      '📄 AI 正在对比岗位要求与您的背景...',
      '💡 AI 正在设计针对性的技术问题...',
      '🎯 AI 正在挖掘您简历中的项目亮点...',
      '🧠 AI 正在构思场景化的面试问题...',
      '⚙️ AI 正在设计不同难度的问题组合...',
    ];

    let index = 0;

    const timer = setInterval(() => {
      if (subject.closed) {
        clearInterval(timer);
        return;
      }

      const label = messages[index % messages.length];

      this.emitProgress(subject, progress, label);

      progress++;
      index++;

      // 防止无限增长
      if (progress > 50) {
        progress = 10;
      }
    }, 800); // 固定0.8秒一次，和你图里节奏一致

    // 返回停止函数
    return () => clearInterval(timer);
  }

  /**
   * 提取简历内容
   * 支持3种方式：直接文本、结构化简历、上传文件
   * @param userId
   * @param dto
   */
  private async extractResumeContent(
    userId: string,
    dto: ResumeQuizDto,
  ): Promise<string> {
    // 优先级1：如果直接提供了简历文本，就优先使用文本
    if (dto.resumeContent) {
      this.logger.log(
        `✅️使用直接提供的简历文本，长度=${dto.resumeContent.length}字符`,
      );
      return dto.resumeContent;
    }

    // 优先级2：如果提供了resumeId，尝试查询
    // 之前的ResumeQuizDto中没有创建resumeURL属性，在此补充
    if (dto.resumeURL) {
      try {
        // 1.从URL下载文件
        const rawText = await this.documentParserService.parseDocumentFromUrl(
          dto.resumeURL,
        );

        // 2.清理文本（移除格式化符号等
        const cleanedText = this.documentParserService.cleanText(rawText);

        // 3.验证内容质量
        const validation =
          this.documentParserService.validateResumeContent(cleanedText);

        if (!validation.isValid)
          throw new BadRequestException(validation.reason);

        // 4.记录任何警告
        if (validation.warnings && validation.warnings.length > 0)
          this.logger.warn(`简历解析警告：${validation.warnings.join('；')}`);

        // 5.检查内容长度（避免超长上下文
        const estimatedTokens =
          this.documentParserService.estimateTokens(cleanedText);

        // 如果内容过长则单独截断处理后再返回结果
        if (estimatedTokens > 6000) {
          this.logger.warn(
            `简历内容过长：${estimatedTokens}tokens，将进行截断`,
          );
          // 截取前6000个tokens对应的字符
          const maxChars = 6000 * 1.5; //约9000字符
          const truncatedText = cleanedText.substring(0, maxChars);

          this.logger.log(
            `简历已截断：原长度=${cleanedText.length},` +
              `截断后=${truncatedText.length}` +
              `tokens≈${this.documentParserService.estimateTokens(truncatedText)}`,
          );

          return truncatedText;
        }

        this.logger.log(
          `✅️简历解析成功：长度=${cleanedText.length}字符` +
            `tokens≈${estimatedTokens}`,
        );
        return cleanedText;
      } catch (error) {
        // 文件解析失败，返回错误信息
        if (error instanceof BadRequestException) throw error;

        this.logger.log(
          `❌️解析简历文件失败：resumId=${dto.resumeId},error=${error.message}`,
          error.stack,
        );

        throw new BadRequestException(
          `简历文件解析失败：${error.message}。` +
            `建议：确保上传的是文本型PDF或DOCX文件，未加密且未损坏` +
            `或者直接粘贴简历文本`,
        );
      }
    }

    // 都没有，返回错误
    throw new BadRequestException(`请提供简历ID或简历内容`);
  }

  /**
   *执行开始模拟面试
   *该方法用于启动一场模拟面试，包括检查用户的剩余次数、生成面试开场白、创建面试会话、记录消费记录，并实时向前端推送面试进度。它包括以下几个主要步骤:
   *1.扣除用户模拟面试次数;
   *2.提取简历内容;
   *3.创建会话并生成相关记录;
   *4.流式生成面试开场白，并逐块推送到前端;
   *5.保存面试开场白到数据库;
   *6.处理失败时的退款操作。

   * @param userId 用户ID，表示正在进行面试的用户。
   * @param dto 启动模拟面试的详细数据，包括面试类型、简历ID、职位信息等。
   * @param progressSubject 用于实时推送面试进度的subject对象，前端通过它接收流式数据。
   * 
   * @returns  Promise<void>- 返回一个^Promise`，表示模拟面试的启动过程(包含异步操作)。
   */
  private async executeStartMockInterview(
    userId: string,
    dto: StartMockInterviewDto,
    progressSubject: Subject<MockInterviewEventDto>,
  ): Promise<void> {
    try {
      // 1.检查并扣除次数：根据面试类型选择扣费字段
      const countField =
        dto.interviewType === MockInterviewType.SPECIAL
          ? 'specialRemainingCount'
          : 'behaviorRemainingType';

      // 查找用户并确保剩余次数足够
      const user = await this.userModel.findOneAndUpdate(
        {
          _id: userId,
          [countField]: { $gt: 0 },
        },
        {
          $inc: { [countField]: -1 },
        },
        {
          new: false,
        },
      );

      // 如果用户没有足够的次数，抛出异常
      if (!user)
        throw new BadRequestException(
          `${dto.interviewType === MockInterviewType.SPECIAL ? '专项面试' : '综合面试'}次数不足，请前往充值页面`,
        );

      this.logger.log(
        `✅️用户扣费成功，userId=${userId}，type=${dto.interviewType}，扣费前=${user[countField]}，扣费后=${user[countField] - 1}`,
      );

      // 2.提取简历内容
      const resumeContent = await this.extractResumeContent(userId, {
        resumeId: dto.resumeId,
        resumeContent: dto.resumeContent,
      } as any);

      // 3.创建会话  为每个面试生成唯一的会话ID
      const sessionId = uuidv4();
      const interviewerName = '面试官（喵喵老师）';
      // 设定面试目标时长
      const targetDuration =
        dto.interviewType === MockInterviewType.SPECIAL
          ? this.SPECIAL_INTERVIEW_MAX_DURATION //120分钟
          : this.BEHAVIOR_INTERVIEW_MAX_DURATION; //120分钟

      // 根据工资范围生成工资区间
      const salaryRange =
        dto.minSalary && dto.maxSalary
          ? `${dto.minSalary}K-${dto.maxSalary}K`
          : dto.minSalary
            ? `${dto.minSalary}K起`
            : dto.maxSalary
              ? `${dto.maxSalary}K封顶`
              : undefined;

      // 创建面试会话对象
      const session: InterviewSession = {
        sessionId,
        userId,
        interviewType: dto.interviewType,
        interviewerName,
        candidateName: dto.candidateName,
        company: dto.company || '',
        positionName: dto.positionName,
        salaryRange,
        jd: dto.jd,
        resumeContent,
        conversationHistory: [],
        questionCount: 0,
        startTime: new Date(),
        targetDuration,
        isActive: true,
      };

      // 将会话保存到内存中的会话池
      this.interviewSessions.set(sessionId, session);

      // 4.创建数据库记录并生成uuid
      const resultId = uuidv4();
      const recordId = uuidv4();

      // 为会话分配resultId和消费记录ID
      session.resultId = resultId;
      session.consumptionRecordId = recordId;

      // 保存面试结果记录到数据库
      await this.aiInterviewResultModel.create({
        resultId,
        user: new Types.ObjectId(userId),
        userId,
        interviewType:
          dto.interviewType === MockInterviewType.SPECIAL
            ? 'special'
            : 'behavior',
        company: dto.company || '',
        position: dto.positionName,
        salaryRange,
        jobDescription: dto.jd,
        interviewMode: 'text',
        qaList: [],
        totalQuestions: 0,
        answeredQuestions: 0,
        status: 'in_progress',
        consumptionRecordId: recordId,
        sessionState: session, //保存会话状态
        metadata: {
          interviewerName,
          candidateName: dto.candidateName,
          sessionId,
        },
      });

      // 创建消费记录
      await this.consumptionRecordModel.create({
        resultId,
        recordId,
        user: new Types.ObjectId(userId),
        userId,
        type:
          dto.interviewType === MockInterviewType.SPECIAL
            ? ConsumptionType.SPECIAL_INTERVIEW
            : ConsumptionType.BEHAVIOR_INTERVIEW,
        status: ConsumptionStatus.SUCCESS,
        consumedCount: 1,
        description: `模拟面试 - ${dto.interviewType === MockInterviewType.SPECIAL ? '专项面试' : '综合面试'})`,
        inputData: {
          company: dto.company || '',
          position: dto.positionName,
          interviewType: dto.interviewType,
        },
        outputData: { resultId, sessionId },
        startedAt: session.startTime,
      });

      this.logger.log(
        `✅️面试会话创建成功：sessionId=${sessionId}，resultId=${resultId}，Interviewer=${interviewerName}`,
      );

      // =====关键部分：流式生成开场白=====

      // 5.流式生成开场白
      let fullOpeningStatement = '';
      const openingGenerator = this.aiService.generateOpeningStatementStream(
        interviewerName,
        dto.candidateName,
        dto.positionName,
      );

      // 逐块推送开场白
      for await (const chunk of openingGenerator) {
        fullOpeningStatement += chunk;

        // 发送流式事件
        progressSubject.next({
          type: MockInterviewEventType.START,
          sessionId,
          resultId,
          interviewerName,
          content: fullOpeningStatement,
          questionNumber: 0,
          totalQuestions:
            dto.interviewType === MockInterviewType.SPECIAL ? 12 : 8,
          elapsedMinutes: 0,
          isStreaming: true, //标记为流式传输
        });
      }

      // 记录开场白时间
      const openingStatementTime = new Date();

      // 6.记录对话历史
      session.conversationHistory.push({
        role: 'interviewer',
        content: fullOpeningStatement,
        timestamp: openingStatementTime,
      });

      // 保存开场白到数据库 qaList
      await this.aiInterviewResultModel.findOneAndUpdate(
        { resultId },
        {
          $push: {
            qaList: {
              question: fullOpeningStatement,
              answer: '', //开场白没有用户回答
              answerDuration: 0,
              answeredAt: openingStatementTime, //记录提问时间
              askedAt: openingStatementTime,
            },
          },
          $set: { sessionState: session }, //更新会话状态
        },
      );

      this.logger.log(`✍️开场白已保存到数据库：resultId=${resultId}`);

      // 7.发送最终开场白事件（标记已完成
      progressSubject.next({
        type: MockInterviewEventType.START,
        sessionId,
        resultId,
        interviewerName,
        content: fullOpeningStatement,
        questionNumber: 0,
        totalQuestions:
          dto.interviewType === MockInterviewType.SPECIAL ? 12 : 8,
        elapsedMinutes: 0,
        isStreaming: false, //流式传输已完成
      });

      // 8.发送等待事件
      progressSubject.next({
        type: MockInterviewEventType.WAITING,
        sessionId,
      });

      progressSubject.complete();
    } catch (error) {
      // 失败时退还次数
      const countFiled =
        dto.interviewType === MockInterviewType.SPECIAL
          ? 'special'
          : 'behavior';
      await this.refundCount(userId, countFiled as any);
      throw error;
    }
  }

  /**
   * 开始模拟面试(流式响应)
   * @param userId 用户ID
   * @param dto 请求参数
   * @returns Subject 流式事件
   */
  startMockInterviewWithStream(
    userId: string,
    dto: StartMockInterviewDto,
  ): Subject<MockInterviewEventDto> {
    const subject = new Subject<MockInterviewEventDto>();

    // 异步执行
    this.executeStartMockInterview(userId, dto, subject).catch((error) => {
      this.logger.error(`模拟面试启动失败：${error.message}`, error.stack);
      if (subject && !subject.closed) {
        subject.next({
          type: MockInterviewEventType.ERROR,
          error: error,
        });
        subject.complete();
      }
    });
    return subject;
  }

  /**
   * 流式处理用户回答
   * @param userId
   * @param sessionId
   * @param answer
   * @returns
   */
  anwserMockInterviewWithStream(
    userId: string,
    sessionId: string,
    answer: string,
  ): Subject<MockInterviewEventDto> {
    const subject = new Subject<MockInterviewEventDto>();

    // 异步执行
    this.executeAnswerMockInterview(userId, sessionId, answer, subject).catch(
      (error) => {
        this.logger.error(`处理面试回答失败：${error.message}`, error.stack);
        if (subject && subject.closed) {
          subject.next({
            type: MockInterviewEventType.ERROR,
            error: error,
          });
          subject.complete();
        }
      },
    );
    return subject;
  }

  private async executeAnswerMockInterview(
    userId: string,
    sessionId: string,
    answer: string,
    progressSubject: Subject<MockInterviewEventDto>,
  ): Promise<void> {
    try {
      // 1.获取会话
      const session = this.interviewSessions.get(sessionId);

      if (!session) throw new NotFoundException('面试会话不存在或已过期');

      if (session.userId !== userId)
        throw new BadRequestException('无权访问此面试会话');

      if (!session.isActive) throw new BadRequestException('面试会话已过期');

      // 2.记录候选人回答
      session.conversationHistory.push({
        role: 'candidate',
        content: answer,
        timestamp: new Date(),
      });

      session.questionCount++;

      // 3.计算已用时间
      const elapsedMinutes = Math.floor(
        (Date.now() - session.startTime.getTime()) / 1000 / 60,
      );

      this.logger.log(`当前面试用时：${elapsedMinutes}分钟`);

      this.logger.log(
        `✍️候选人回答：sessionId=${sessionId},questionCount=${session.questionCount},elapsed=${elapsedMinutes}min`,
      );

      // 3.1检查是否超时
      const maxDuration =
        session.interviewType === MockInterviewType.SPECIAL
          ? this.SPECIAL_INTERVIEW_MAX_DURATION
          : this.BEHAVIOR_INTERVIEW_MAX_DURATION;

      if (elapsedMinutes >= maxDuration) {
        this.logger.log(
          `⏰️面试超时，强制结束：sessionId=${sessionId},elapsed=${elapsedMinutes}min,max=${maxDuration}min`,
        );

        // 面试结束
        session.isActive = false;

        // 添加结束语
        const closingStatement = `感谢您今天的面试表现。由于时间关系(已进行${elapsedMinutes}分钟)我们今天的面试就到这里。您的回答让我们对您有了较为全面的了解，后续我们会进行综合评估，有结果会及时通知您。祝您生活愉快！`;

        session.conversationHistory.push({
          role: 'interviewer',
          content: closingStatement,
          timestamp: new Date(),
        });

        // 保存面试结果
        const resultId = await this.saveMockInterviewResult(session);

        // 发送结束事件
      }
    } catch (error) {}
  }

  private async saveMockInterviewResult(
    session: InterviewSession,
  ): Promise<string> {
    try {
      // 如果已经有resultId（通过实时保存创建），直接返回
      if (session.resultId)
        this.logger.log(`✅️使用已有的结果ID：resultId=${session.resultId}`);

      // 更新面试结果和消费记录为完成状态
      await this.aiInterviewResultModel.findOneAndUpdate(
        { resultId: session.resultId },
        {
          $set: {
            status: 'complete', //更新为己完成状态
            completedAt: new Date(), //设置完成时间
            sessionState: session,
          },
        },
      );
    } catch (error) {}
  }

  /**
   * 结束面试（用户主动结束
   * 利用resultID（持久化）查询
   * @param userId
   * @param resultId
   */
  async endMockInterview(userId: string, resultId: string): Promise<void> {
    // TODO:后续执行的逻辑
  }

  /**
   * 暂停面试
   * 利用resultID（持久化）查询
   * @param userId
   * @param resultId
   * @returns
   */
  async pauseMockInterview(
    userId: string,
    resultId: string,
  ): Promise<{ resultId: string; pauseAt: Date }> {
    // TODO:后续执行的逻辑

    return {
      resultId: '',
      pauseAt: new Date(),
    };
  }

  async resumeMockInterview(
    userId: string,
    resultId: string,
  ): Promise<{
    resultId: string;
    sessionId: string;
    currentQuestion: number;
    totalQuestion: number;
    lastQuestion?: string;
    conversationHistory?: Array<{
      role: 'interviewer' | 'candidate';
      content: string;
      timestamp: Date;
    }>;
  }> {
    // TODO:后续执行逻辑

    return {
      resultId,
      sessionId: '',
      currentQuestion: 0,
      totalQuestion: 0,
      lastQuestion: '',
      conversationHistory: [],
    };
  }
}
