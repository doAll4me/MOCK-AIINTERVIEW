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
import { ResumeQuizAnalysisDto } from '../dto/analysis-report.dto';
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
    const stopProgress = this.startGeneratingProgress(progressSubject);

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

      // this.startGeneratingProgress(progressSubject);

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
      // ✅ 3.保存结果到 ResumeQuizResult（一定要有，否则缓存会“结果不存在”）
      await this.resumeQuizResultModel.create({
        resultId,
        user: new Types.ObjectId(userId),
        userId,
        resumeId: dto.resumeId,
        company: dto.company,
        position: dto.positionName,
        salaryRange:
          dto.minSalary && dto.maxSalary
            ? `${dto.minSalary}K-${dto.maxSalary}K`
            : dto.minSalary
              ? `${dto.minSalary}K起`
              : dto.maxSalary
                ? `${dto.maxSalary}K封顶`
                : undefined,
        jobDescription: dto.jd,

        questions: aiResult.questions ?? [],
        totalQuestions: (aiResult.questions ?? []).length,
        summary: aiResult.summary ?? '',

        matchScore: aiResult.matchScore ?? 0,
        matchLevel: aiResult.matchLevel ?? '中等',
        matchedSkills: aiResult.matchedSkills ?? [],
        missingSkills: aiResult.missingSkills ?? [],
        knowledgeGaps: aiResult.knowledgeGaps ?? [],
        learningPriorities: aiResult.learningPriorities ?? [],
        radarData: aiResult.radarData ?? [],
        strengths: aiResult.strengths ?? [],
        weaknesses: aiResult.weaknesses ?? [],
        interviewTips: aiResult.interviewTips ?? [],

        consumptionRecordId: recordId,
        aiModel: 'deepseek-chat',
        promptVersion: dto.promptVersion || 'v2',
      });

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
      stopProgress?.();
      this.emitProgress(
        progressSubject,
        100,
        `✅️所有分析完成，正在保存结果...响应数据为${JSON.stringify(result)}`,
      );
      this.emitComplete(progressSubject, result);
    } catch (error) {
      stopProgress?.();
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

  /**
   * 获取各功能剩余的可使用次数
   * @param userId
   * @param type
   * @returns
   */
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
    if (subject && !subject.closed) {
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
      } as ResumeQuizDto);

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
    const subject = new Subject<MockInterviewEventDto>(); //Subject 是 RxJS的观察者模式

    // 异步执行（不等executeAnswerMockInterview返回，直接return subject，这样可以实现非阻塞
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

  /**
   * 执行处理候选人回答
   *
   * @param userId 用户ID
   * @param sessionId 会话ID
   * @param answer 候选人回答
   * @param progressSubject 用于实时推送面试进度的 Subject对象，前端通过它接收流式数据。
   *
   * @returns Promise<void> - 返回一个Promise，表示处理候选人回答的过程(包含异步操作)。
   */
  private async executeAnswerMockInterview(
    userId: string,
    sessionId: string,
    answer: string,
    progressSubject: Subject<MockInterviewEventDto>,
  ): Promise<void> {
    // 1.获取会话并验证
    const session = this.interviewSessions.get(sessionId);
    if (!session) throw new NotFoundException('面试会话不存在或已过期'); // （验证会话是否存在？
    if (session.userId !== userId)
      throw new BadRequestException('无权访问此面试会话'); //是否同一个用户？
    if (!session.isActive) throw new BadRequestException('面试会话已过期'); //会话是否还在进行中？

    // 2.记录候选人回答
    session.conversationHistory.push({
      //把用户回答添加到对话历史中
      role: 'candidate',
      content: answer,
      timestamp: new Date(),
    });
    session.questionCount++; //增加问题计数

    // 3.计算已用时间（检查是否超时
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

    // 若超时，处理为结束，不再继续生成下一个问题
    if (elapsedMinutes >= maxDuration) {
      this.logger.log(
        `⏰️面试超时，强制结束：sessionId=${sessionId},elapsed=${elapsedMinutes}min,max=${maxDuration}min`,
      );

      // 面试结束
      session.isActive = false;
      // 添加结束语
      const closingStatement = `感谢您今天的面试表现。由于时间关系(已进行${elapsedMinutes}分钟)我们今天的面试就到这里。您的回答让我们对您有了较为全面的了解，后续我们会进行综合评估，有结果会及时通知您。祝您生活愉快！`;
      // 保存面试结果
      session.conversationHistory.push({
        role: 'interviewer',
        content: closingStatement,
        timestamp: new Date(),
      });
      const resultId = await this.saveMockInterviewResult(session);

      // 发送结束事件
      progressSubject.next({
        type: MockInterviewEventType.END,
        sessionId,
        content: closingStatement,
        resultId,
        elapsedMinutes,
        isStreaming: false, //流式传输已完成
        metadata: {
          totalQuestions: session.questionCount,
          interviewName: session.interviewerName,
          reason: 'timeout', //标记为超时结束
        },
      });

      // TODO：异步生成评估报告

      // 清理会话（延迟清理
      setTimeout(
        () => {
          this.interviewSessions.delete(sessionId);
          this.logger.log(`🚮会话已清除：sessionId=${sessionId}`);
        },
        5 * 60 * 1000,
      );

      progressSubject.complete();
      return; //提前返回，不再继续生成下一个问题
    }

    // 4.发送思考中事件（告诉前端我在思考，马上会有新的问题
    progressSubject.next({
      type: MockInterviewEventType.THINKING,
      sessionId,
    });

    // 5.流式生成下一个问题
    const questionStartTime = new Date();
    let fullQuestion = '';
    let aiResponse: {
      question: string;
      shouldEnd: boolean;
      standardAnswer?: string;
      reasoning?: string;
    } | null = null;
    const questionGenerator = this.aiService.generateInterviewQuestionStream({
      interviewType:
        session.interviewType === MockInterviewType.SPECIAL
          ? 'special'
          : 'comprehensive',
      resumeContent: session.resumeContent,
      company: session.company || '',
      positionName: session.positionName,
      jd: session.jd,
      conversationHistory: session.conversationHistory.map((h) => ({
        role: h.role,
        content: h.content,
      })),
      elapsedMinutes,
      targetDuration: session.targetDuration,
    });

    // 逐块推送问题内容，并铺货返回值
    let hasStandardAnswer = false; //标记是否已检测到标准答案
    let questionOnlyContent = ''; //只包含问题的内容
    let standardAnswerContent = ''; // 标准答案内容

    // 调用AI service里的生成器questionGenerator生成ai回答（问题+标准答案）
    let result = await questionGenerator.next();
    while (!result.done) {
      const chunk = result.value;
      fullQuestion += chunk;

      // 检查是否包含标准答案
      const standardAnswerIndex = fullQuestion.indexOf('[STANDARD_ANSWER]');

      // 如果已包含标准答案：
      if (standardAnswerIndex != -1) {
        // 监测到标准答案
        if (!hasStandardAnswer) {
          // 第一个监测到，提取问题部分
          questionOnlyContent = fullQuestion
            .substring(0, standardAnswerIndex)
            .trim();
          hasStandardAnswer = true;

          // 发送最终 【问题内容】 （标记流式已完成
          progressSubject.next({
            type: MockInterviewEventType.QUESTION,
            sessionId,
            interviewerName: session.interviewerName,
            content: questionOnlyContent,
            questionNumber: session.questionCount,
            totalQuestions:
              session.interviewType === MockInterviewType.SPECIAL ? 12 : 8,
            elapsedMinutes,
            isStreaming: false, //流式传输已完成
          });

          // 立即发送等待事件，告诉前端问题已结束
          progressSubject.next({
            type: MockInterviewEventType.WAITING,
            sessionId,
          });

          this.logger.log(
            `✅️问题生成完成，进入参考答案生成阶段：questionLength=${questionOnlyContent.length}`,
          );
        }

        // 提取 【参考答案】 并流式推送
        const currentStandardAnswer = fullQuestion //fullQuestion 不断变长
          // 找到 [STANDARD_ANSWER]截取后面的内容
          .substring(standardAnswerIndex + '[STANDARD_ANSWER]'.length)
          .trim();

        // 判断是否变长 推送更新;
        if (currentStandardAnswer.length > standardAnswerContent.length) {
          standardAnswerContent = currentStandardAnswer;

          // 流式推送参考答案
          progressSubject.next({
            type: MockInterviewEventType.REFERENCE_ANSWER,
            sessionId,
            interviewerName: session.interviewerName,
            content: standardAnswerContent,
            questionNumber: session.questionCount,
            totalQuestions:
              session.interviewType === MockInterviewType.SPECIAL ? 12 : 8,
            elapsedMinutes,
            isStreaming: true, //标记为流式传输中
          });
        }
      }
      // 还未有标准答案，还在生成问题阶段，继续推送
      else {
        progressSubject.next({
          type: MockInterviewEventType.QUESTION,
          sessionId,
          interviewerName: session.interviewerName,
          content: fullQuestion,
          questionNumber: session.questionCount,
          totalQuestions:
            session.interviewType === MockInterviewType.SPECIAL ? 12 : 8,
          elapsedMinutes,
          isStreaming: true, //标记为流式传输中
        });
      }

      result = await questionGenerator.next();
    }

    // generator完成后，发送参考答案的最终状态
    if (hasStandardAnswer && standardAnswerContent) {
      progressSubject.next({
        type: MockInterviewEventType.REFERENCE_ANSWER,
        sessionId,
        interviewerName: session.interviewerName,
        content: standardAnswerContent,
        questionNumber: session.questionCount,
        totalQuestions:
          session.interviewType === MockInterviewType.SPECIAL ? 12 : 8,
        elapsedMinutes,
        isStreaming: false, //流式传输完成
      });
    }

    // Generator完成，result.value现在是返回值
    aiResponse = result.value ?? null;
    if (!aiResponse) {
      throw new Error('AI generator ended without returning aiResponse');
    }

    // 如果没有标准答案（可能ai没有生成），则使用完整内容
    if (!hasStandardAnswer) {
      questionOnlyContent = fullQuestion;
      this.logger.warn(`⚠️未检测到标准答案标记，使用完整内容作为问题`);
    }

    // 6.确保session.resultId存在
    if (!session.resultId) {
      this.logger.error(
        `❌️session.resultId不存在，无法保存数据：sessionId=${sessionId}`,
      );
      throw new Error('session.resultId不存在，无法保存数据');
    }

    // 7.【步驟1】保存上一轮对话（更新用户回答
    // 在 conversationHistory 中:
    //  - length - 1: 刚 push 的用户回答
    //  - length - 2: 上一个面试官问题(用户回答的这个问题)
    if (session.conversationHistory.length >= 2) {
      const userAnswerIndex = session.conversationHistory.length - 1;
      const prevQuestionIndex = session.conversationHistory.length - 2;

      const userAnswer = session.conversationHistory[userAnswerIndex];
      const prevQuestion = session.conversationHistory[prevQuestionIndex];

      // 检查是否是开场白（开场白是第一条面试官发送的消息，index=0
      const isOpeningStatement = prevQuestionIndex === 0;

      if (
        prevQuestion.role === 'interviewer' &&
        userAnswer.role === 'candidate'
      ) {
        if (isOpeningStatement) {
          // 更新开场白的用户回答
          const qaIndex = session.questionCount - 1; //qaList中的索引
          await this.updateInterviewAnswer(
            session.resultId,
            qaIndex,
            userAnswer.content,
            userAnswer.timestamp,
            session,
          );
        }
      }
    }

    // 8.【步骤2】在AI开始生成前，先创建占位项（占位符+实时更新）
    // 查询当前qaList的长度以确定新问题的索引
    const dbRecord = await this.aiInterviewResultModel.findOne({
      resultId: session.resultId,
    });

    const newQAIndex = dbRecord?.qaList?.length || 0; //新问题的索引

    await this.createInterviewQuestionPlaceholder(
      session.resultId,
      questionStartTime,
    );

    // 9.记录AI生成的新问题（包括标准答案）到内存
    session.conversationHistory.push({
      role: 'interviewer',
      content: aiResponse.question,
      timestamp: questionStartTime,
      standardAnswer: aiResponse.standardAnswer,
    });

    // 10.【步骤3】AI问题生成完后 更新占位项的问题内容
    await this.updateInterviewQuestion(
      session.resultId,
      newQAIndex,
      aiResponse.question,
      questionStartTime,
    );

    // 11.【步驟4】AI标准答案生成完后，更新标准答案
    await this.updateInterviewStandardAnswer(
      session.resultId,
      newQAIndex,
      aiResponse.standardAnswer,
    );

    // 12.更新sessionState到数据库
    await this.aiInterviewResultModel.findOneAndUpdate(
      { resultId: session.resultId },
      {
        $set: {
          sessionState: session, //同步会话状态
        },
      },
    );

    // 13.判断是否结束面试
    if (aiResponse.shouldEnd) {
      // 面试结束
      const resultId = await this.saveMockInterviewResult(session);

      // 发送结束事件
      progressSubject.next({
        type: MockInterviewEventType.END,
        sessionId,
        content: aiResponse.question,
        resultId,
        elapsedMinutes,
        isStreaming: false, //流式传输完成
        metadata: {
          totalQuestions: session.questionCount,
          interviewName: session.interviewerName,
        },
      });

      // 清理会话（延迟一会，给前端获取结果的时间
      setTimeout(
        () => {
          this.interviewSessions.delete(sessionId);
          this.logger.log(`🚮会话已清理：sessionId=${sessionId}`);
        },
        5 * 60 * 1000,
      );
    } else {
      // 继续面试
      // 若没有检测到标准答案，则发送最终问题事件
      if (!hasStandardAnswer) {
        progressSubject.next({
          type: MockInterviewEventType.QUESTION,
          sessionId,
          interviewerName: session.interviewerName,
          content: aiResponse.question,
          questionNumber: session.questionCount,
          totalQuestions:
            session.interviewType === MockInterviewType.SPECIAL ? 12 : 8,
          elapsedMinutes,
          isStreaming: false, //流式传输完成
        });

        // 发送等待事件
        progressSubject.next({
          type: MockInterviewEventType.WAITING,
          sessionId,
        });
      }
      // 若已经检测到标准答案，之前已经处理过了
    }
    progressSubject.complete();
  }

  /**
   * 保存模拟面试结果(面试结束时调用)
   * 如果已经通过实时保存创建了记录，则直接返回resultId。
   * 该方法的主要功能是根据面试会话保存最终的面试结果到数据库，并生成相关的消费记录。
   *
   * @param session 面试会话对象，包含了此次模拟面试的所有信息，包括面试类型、会话状态、对话历史等。
   * @returns Promise<string> - 返回面试结果ID(resultId)，标识当前模拟面试的唯一结果。
   */
  private async saveMockInterviewResult(
    session: InterviewSession,
  ): Promise<string> {
    try {
      // 如果已经有resultId（通过实时保存创建），直接返回
      if (session.resultId) {
        this.logger.log(`✅️使用已有的结果ID：resultId=${session.resultId}`);

        // 更新面试结果和消费记录为完成状态
        await this.aiInterviewResultModel.findOneAndUpdate(
          { resultId: session.resultId },
          {
            $set: {
              status: 'complete', //更新为己完成状态
              completedAt: new Date(), //设置完成时间
              sessionState: session, //保存最终会话状态(包括结束语)
            },
          },
        );

        // 如果有消费记录ID 更新消费记录为成功
        if (session.consumptionRecordId) {
          await this.consumptionRecordModel.findOneAndUpdate(
            { recordId: session.consumptionRecordId },
            {
              $set: {
                completedAt: new Date(), //设置消费记录完成时间
                status: ConsumptionStatus.SUCCESS,
              },
            },
          );
        }
        return session.resultId; //如果有结果ID 直接返回
      }

      // 如果没有resultId(没有实时保存或出错)，则使用原有逻辑创建完整记录
      const resultId = uuidv4();
      const recordId = uuidv4();

      // 构建问答列表
      const qaList: any[] = [];
      for (let i = 0; i < session.conversationHistory.length; i += 2) {
        if (i + 1 < session.conversationHistory.length) {
          qaList.push({
            question: session.conversationHistory[i].content, //问题内容
            answer: session.conversationHistory[i + 1].content, //答案内容
            standardAnswer: session.conversationHistory[i].standardAnswer, // 标准答案 (如果有)
            answerDuration: 0, //文字面试无法准确计算答题时间
            answeredAt: session.conversationHistory[i + 1].timestamp, // 答题时间
          });
        }
      }

      // 计算面试时长
      const durationMinutes = Math.floor(
        (Date.now() - session.startTime.getTime()) / 1000 / 60, //转换为分钟
      );

      // 创建面试结果记录
      await this.aiInterviewResultModel.create({
        resultId,
        user: new Types.ObjectId(session.userId),
        userId: session.userId,
        interviewType:
          session.interviewType === MockInterviewType.SPECIAL
            ? 'special'
            : 'behavior',
        company: session.company || '', //公司名称
        position: session.positionName, //职位名称
        salaryRange: session.salaryRange, // 工资范围
        jobDescription: session.jd, //职位描述
        interviewDuration: durationMinutes, // 面试时长
        interviewMode: 'text', //模拟面试的模式(文字)
        qaList, //问答列表
        totalQuestions: qaList.length, // 总问题数
        answeredQuestions: qaList.length, //已回答问题数
        status: 'complete', //设置为完成状态
        completedAt: new Date(), //设置完成时间
        consumptionRecordId: recordId, //消费记录ID
        metadata: {
          interviewerName: session.interviewerName, // 面试官姓名
          candidateName: session.candidateName, //候选人姓名
        },
      });

      // 创建消费记录
      await this.consumptionRecordModel.create({
        recordId, //消费记录唯一ID
        user: new Types.ObjectId(session.userId),
        userId: session.userId,
        type:
          session.interviewType === MockInterviewType.SPECIAL
            ? ConsumptionType.SPECIAL_INTERVIEW
            : ConsumptionType.BEHAVIOR_INTERVIEW,
        status: ConsumptionStatus.SUCCESS, //标记为消费成功
        consumedCount: 1, //消费次数
        description: `模拟面试 - ${session.interviewType === MockInterviewType.SPECIAL ? '专项面试' : '综合面试'} `,

        // 输入参数（用于调试和重现问题
        inputData: {
          company: session?.company || '',
          positionName: session.positionName,
          interviewType: session.interviewType,
        },
        outputData: {
          resultId, //结果ID
          questionCount: qaList.length, // 问题数量
          duration: durationMinutes, // 面试时长
        },
        resultId,
        startedAt: session.startTime,
        completedAt: new Date(),
      });

      this.logger.log(
        `✅️面试结果保存成功（完整创建）：resultId=${resultId}，duration=${durationMinutes}min`,
      );

      return resultId;
    } catch (error) {
      // 出现异常时记录错误并抛出
      this.logger.error(`❌️保存面试结果失败：${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   *【步骤1】更新用户回答
   * 在用户提交回答时调用。该方法用于更新面试结果中的用户回答内容，并在用户首次回答时增加回答计数。
   * 另外，还可以同步更新面试会话的状态(sessionState)，以便持续跟踪和保存面试进度。
   *
   * @param resultId - 面试结果的唯一标识符，用于查找对应的面试结果记录。
   * @param qaIndex - 问题的索引，用于确定更新的是哪一个问题的回答。
   * @param answer -用户的回答内容。
   * @param answeredAt -用户提交回答的时间。
   * @param session  -可选的session 对象，用于更新面试会话的状态。
   * @returns Promise<void> - 返回一个Promise，表示更新操作的结果(没有返回值)
   */
  private async updateInterviewAnswer(
    resultId: string,
    qaIndex: number,
    answer: string,
    answeredAt: Date,
    session?: InterviewSession, //可选的session，用于更新sessionState
  ): Promise<void> {
    try {
      // 检查是否是第一次回答（避免重复计数
      // 为什么要检查是不是第一次回答?
      // 因为有时候网络会重试，可能同一个问题的回答被提交两次。如果都计数的话，answeredQuestions 会不准确。
      // 所以我们检查:这个问题之前有没有回答过?如果没有(为空)，才增加计数。

      // 查找面试结果，检查该问题是否有过回答
      const existingRecord = await this.aiInterviewResultModel.findOne({
        resultId,
      });

      // 判断是否是第一次回答
      const isFirstAnswer =
        !existingRecord?.qaList[qaIndex]?.answer ||
        existingRecord.qaList[qaIndex].answer === '';

      // 更新操作的查询对象
      const updateQuery: any = {
        $set: {
          [`qaList.${qaIndex}.answer`]: answer, //更新当前问题的回答
          [`qaList.${qaIndex}.answeredAt`]: answeredAt, //更新回答时间
        },
      };

      // 如果传递了session（存在面试会话），同步更新会话状态
      if (session) {
        updateQuery.$set.sessionState = session;
      }

      // 只有在第一次回答时，才增加已回答的问题计数
      if (isFirstAnswer) updateQuery.$inc = { answeredQuestions: 1 }; //增加回答的数量

      //更新面试结果记录，并返回更新后的记录
      const result = await this.aiInterviewResultModel.findOneAndUpdate(
        { resultId },
        updateQuery,
        { new: true }, //获取更新后的记录
      );

      if (result) {
        // 更新成功，打印日志
        this.logger.log(
          `✅️【步骤1】更新用户回答成功：resultId=${resultId},qaIndex=${qaIndex},answer前50字=${answer.substring(0, 50)}... ，isFirstAnswer=${isFirstAnswer}`,
        );
      } else {
        // 更新失败，记录错误日志
        this.logger.error(
          `❌️【步骤1】更新用户回答失败：未找到resultId=${resultId}`,
        );
      }
    } catch (error) {
      // 处理异常并记录错误
      this.logger.error(
        `❌️【步骤1】更新用户回答异常：${error.message}`,
        error.stack,
      );
    }
  }

  /**
   *
   * 【步骤2】创建问题占位项
   * 在AI开始生成问题前调用。该方法用于在面试结果中创建一个“问题占位项”，
   * 以便在AI生成问题之前，能够先占据一个位置，保证面试流程的顺利进行。
   * 这个占位项会在实际问题生成后更新为问题内容和答案。
   *
   * @param resultId - 面试结果的唯一标识符，用于查找对应的面试结果记录。
   * @param askedAt - 问题生成的时间，通常是AI开始生成问题的时间。
   * @returns Promise<void> - 返回一个Promise，表示创建占位项的操作结果(没有返回值)
   */
  private async createInterviewQuestionPlaceholder(
    resultId: string,
    askedAt: Date,
  ): Promise<void> {
    try {
      // 创建问题占位项，表示问题正在生成中
      const placeholderItem = {
        question: '[生成中...]', //占位文本，表示问题正在生成
        answer: ' ', //用户回答为空
        standardAnswer: ' ', //标准答案为空
        answerDuration: 0, //答案时长为空
        askedAt: askedAt, //问题生成的时间
        answeredAt: null, //答案时间为空，尚未回答（目前只是作为占位符
      };

      // 使用函数更新面试记录，将占位符添加到qaList中
      const result = await this.aiInterviewResultModel.findOneAndUpdate(
        { resultId }, //查找对应的面试结果记录
        {
          $push: { qaList: placeholderItem }, //将占位符添加到qaList
          $inc: { totalQuestions: 1 }, //更新问题总数（在原值上+1
        },
        { new: true }, //返回更新后的结果
      );

      if (result) {
        // 更新成功，打印日志
        this.logger.log(
          `✅️【步骤2】创建问题占位项成功：resultId=${resultId},qaList长度=${result.qaList.length}`,
        );
      } else {
        // 更新失败，记录错误日志
        this.logger.error(
          `❌️【步骤2】创建问题占位项失败：未找到resultId=${resultId}`,
        );
      }
    } catch (error) {
      // 处理异常并记录错误
      this.logger.error(
        `❌️【步骤2】创建问题占位项异常：${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * 【步骤3】更新问题内容
   * 在AI问题生成完成后调用。该方法用于更新面试记录中的问题内容，
   * 以便将AI生成的实际问题填充到相应的位置，从而更新占位符为具体的面试问题。
   *
   * @param resultId - 面试结果的唯一标识符，用于查找对应的面试结果记录。
   * @param qaIndex - 问题的索引，用于确定更新的是哪一个问题。
   * @param question - AI生成的实际问题内容。
   * @param askedAt - 问题生成的时间，通常是AI生成问题的时间。
   * @returns Promise<void>- 返回一个Promise，表示更新操作的结果(没有返回值)
   */
  private async updateInterviewQuestion(
    resultId: string,
    qaIndex: number,
    question: string,
    askedAt: Date,
  ): Promise<void> {
    try {
      // 更新面试记录中的问题内容
      const result = await this.aiInterviewResultModel.findOneAndUpdate(
        { resultId },
        {
          $set: {
            [`qaList.${qaIndex}.question`]: question, //更新问题内容
            [`qaList.${qaIndex}.askedAt`]: askedAt, //更新问题生成时间
          },
        },
        { new: true }, //返回更新后的结果
      );

      if (result) {
        // 更新成功，打印日志
        this.logger.log(
          `✅️【步骤3】更新问题内容成功：resultId=${resultId},qaIndex=${qaIndex},question前50字=${question.substring(0, 50)}...`,
        );
      } else {
        // 更新失败，记录错误日志
        this.logger.error(
          `❌️【步骤3】更新问题内容失败：未找到resultId=${resultId}`,
        );
      }
    } catch (error) {
      // 处理异常并记录错误
      this.logger.error(
        `❌️【步骤3】更新问题内容异常：${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * 【步骤4】更新标准答案
   * 在AI标准答案生成完成后调用。该方法用于更新面试记录中的标准答案，
   * 以便将AI生成的标准答案填充到相应的问题记录中，从而确保面试问题的完* 整性。
   *
   * @param resultId- 面试结果的唯一标识符，用于查找对应的面试记录。
   * @param qaIndex- 问题的索引，用于确定更新的是哪一个问题的标准答案。
   * @param standardAnswer - AI生成的标准答案内容。
   * @returns Promise<void> - 返回一个Promise，表示更新操作的结果(没有返回值)
   */
  private async updateInterviewStandardAnswer(
    resultId: string,
    qaIndex: number,
    standardAnswer: string | undefined,
  ): Promise<void> {
    try {
      // 更新面试记录中的标准答案
      const result = await this.aiInterviewResultModel.findOneAndUpdate(
        { resultId },
        {
          $set: {
            [`qaList.${qaIndex}.standardAnswer`]: standardAnswer, //更新问题对应的标准答案
          },
        },
        { new: true }, //返回更新后的结果
      );

      if (result) {
        // 更新成功，打印日志
        this.logger.log(
          `✅️【步骤4】更新标准答案成功：resultId=${resultId},qaIndex=${qaIndex},standardAnswer前50字=${standardAnswer?.substring(0, 50)}...`,
        );
      } else {
        // 更新失败，记录错误日志
        this.logger.error(
          `❌️【步骤4】更新标准答案失败：未找到resultId=${resultId}`,
        );
      }
    } catch (error) {
      // 处理异常并记录错误
      this.logger.error(
        `❌️【步骤4】更新标准答案异常：${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * 结束面试（用户主动结束
   * 利用resultID（持久化）查询
   * @param userId
   * @param resultId
   */
  async endMockInterview(userId: string, resultId: string): Promise<void> {
    // 1.从数据库查询面试记录
    const dbResult = await this.aiInterviewResultModel.findOne({
      resultId,
      userId,
    });

    if (!dbResult) throw new NotFoundException('面试记录不存在');
    if (dbResult.status === 'paused')
      throw new BadRequestException('面试已暂停');
    if (dbResult.status === 'completed')
      throw new BadRequestException('面试已结束');

    // 2.从sessionState中获取会话
    let session: InterviewSession;

    if (dbResult.sessionState) {
      session = dbResult.sessionState as InterviewSession;
    } else {
      throw new BadRequestException('无法加载面试状态');
    }

    // 3.标记为已结束
    session.isActive = false;

    // 4.添加面试结束语
    const closingStatement = this.aiService.generateClosingStatement(
      session.interviewerName,
      session.candidateName,
    );

    session.conversationHistory.push({
      role: 'interviewer',
      content: closingStatement,
      timestamp: new Date(),
    });

    // 5.保存结果
    await this.saveMockInterviewResult(session);

    // TODO: 6.异步生成评估报告
    this.logger.log(`✅️面试已结束：resultId=${resultId}，开始生成评估报告...`);

    // 7.从内存中清理会话
    if (session?.sessionId) {
      this.interviewSessions.delete(session.sessionId);
      this.logger.log(`🚮会话已从内存中清理：sessionId=${session.sessionId}`);
    }
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
  ): Promise<{ resultId: string; pausedAt: Date }> {
    let pausedAt: Date;
    try {
      // 1.从数据库中查询面试记录
      const dbResult = await this.aiInterviewResultModel.findOne({
        resultId,
        userId,
      });

      if (!dbResult) throw new NotFoundException('面试记录不存在');
      if (dbResult.status === 'paused')
        throw new BadRequestException('面试已暂停');
      if (dbResult.status === 'completed')
        throw new BadRequestException('面试已结束，无法暂停');

      // 2.更新为暂停状态
      pausedAt = new Date();
      await this.aiInterviewResultModel.findOneAndUpdate(
        { resultId },
        {
          $set: {
            status: 'paused',
            pausedAt,
          },
        },
      );

      this.logger.log(`⏸️面试已暂停：resultId=${resultId}`);

      // 3.从内存中清理会话
      const session = dbResult.sessionState as InterviewSession;
      if (session?.sessionId) {
        this.interviewSessions.delete(session.sessionId);
        this.logger.log(`🚮会话已从内存中清理：sessionId=${session.sessionId}`);
      }
    } catch (error) {
      this.logger.error(`❌️暂停面试异常：${error.message}`, error.stack);
      throw error;
    }
    return {
      resultId,
      pausedAt,
    };
  }

  /**
   * 恢复面试
   * 利用resultID（持久化）查询
   * @param userId
   * @param resultId
   * @returns
   */
  async resumeMockInterview(
    userId: string,
    resultId: string,
  ): Promise<{
    resultId: string;
    sessionId: string;
    currentQuestion: number;
    totalQuestion?: number;
    lastQuestion?: string;
    conversationHistory: Array<{
      role: 'interviewer' | 'candidate';
      content: string;
      timestamp: Date;
    }>;
  }> {
    try {
      // 1.从数据库查询面试记录
      const dbResult = await this.aiInterviewResultModel.findOne({
        resultId,
        userId,
        status: 'paused',
      });

      if (!dbResult)
        throw new NotFoundException('未找到可恢复的面试，或面试未暂停');

      // 2.从sessionState恢复会话
      if (!dbResult.sessionState)
        throw new BadRequestException('会话数据不完整，无法恢复');
      const session: InterviewSession =
        dbResult.sessionState as InterviewSession;

      // 确保会话数据完整
      if (!session || !session.sessionId)
        throw new BadRequestException('会话数据不完整，无法恢复');

      // 3.重新激活会话并放回内存
      session.isActive = true;
      this.interviewSessions.set(session.sessionId, session);

      // 4.更新数据库状态
      await this.aiInterviewResultModel.findOneAndUpdate(
        { resultId },
        {
          $set: {
            status: 'in_progress',
            resumedAt: new Date(),
            sessionState: session, //更新当前会话的状态
          },
        },
      );

      this.logger.log(
        `▶面试已恢复：resultId=${resultId}，sessionId=${session.sessionId}，questionCount=${session.questionCount}`,
      );

      // 5.获取最后一个问题（方便继续会话 继续回答
      let lastQuestion: string | undefined;
      if (session.conversationHistory.length > 0) {
        const lastEntry =
          session.conversationHistory[session.conversationHistory.length - 1];
        if (lastEntry.role === 'interviewer') {
          lastQuestion = lastEntry.content;
        }
      }

      return {
        resultId,
        sessionId: session.sessionId,
        currentQuestion: session.questionCount,
        lastQuestion,
        conversationHistory: session.conversationHistory,
      };
    } catch (error) {
      this.logger.error(`❌️暂停面试异常：${error.message}`, error.stack);
      throw error;
    }
  }

  // 获取分析报告
  async getAnalysisReport(userId: string, resultId: string): Promise<any> {
    // 首先尝试从简历押题结果中查找
    const resumeQuizResult = await this.resumeQuizResultModel.findOne({
      resultId,
      userId,
    });

    if (resumeQuizResult) {
      const result = this.generateResumeQuizAnalysis(resumeQuizResult);
      return result;
    }

    // 然后尝试从AI模拟面试中查找
    // const aiInterviewResult = await this.aiInterviewResultModel.findOne({
    //   resultId,
    //   userId,
    // });
    // if (aiInterviewResult) {
    //   const reportStatus =
    //     aiInterviewResult.reportStatus || ReportStatus.PENDING;

    //   if (reportStatus === ReportStatus.PENDING) {
    //     this.generateAssessmentReportAsync(resultId);
    //   }

    //   if (
    //     reportStatus === ReportStatus.PENDING ||
    //     reportStatus === ReportStatus.GENERATING
    //   )
    //     throw new BadRequestException(
    //       '评估报告正在生成中，请稍后再试（预计1-2分钟）',
    //     );

    //   if (reportStatus === ReportStatus.FAILED)
    //     throw new BadRequestException(
    //       '评估报告正在生成中，请稍后再试（预计1-2分钟）',
    //     );

    //   return aiInterviewResult;
    // }

    // throw new NotFoundException('未找到该分析报告');
  }

  /**
   * description生成并返回一份简历押题分析报告。
   * 该函数不执行AI分析，而是将已存在的AI分析结果(存储在数据库中)格式化为DTo(数据传输对象)，
   * 同时会更新该报告的查看次数和最后查看时间。
   *
   *@param {ResumeQuizResultDocument}result  -从数据库中获取的简历押题结果文档，其中包含了AI已经生成的所有分析数据。
   *@returns {Promise<ResumeQquizAnalysisDto>} -一个Promise，解析后为格式化好的分析报告DTo，用于前端展示或API返回。
   */
  private async generateResumeQuizAnalysis(
    result: ResumeQuizResultDocument,
  ): Promise<ResumeQuizAnalysisDto> {
    // 1.更新文档的统计数据
    // 每次调用此函数，都默认报告被查看了一次，
    await this.resumeQuizResultModel.findOneAndUpdate(
      { resultId: result.resultId, userId: result.userId },
      {
        $inc: { viewCount: 1 },
        $set: { lastViewedAt: new Date() },
      },
    );

    // 2.获取并格式化创建时间(兼容mongoose自动添加的时间戳)
    const createdAt = (result as any).createdAt
      ? new Date((result as any).createdAt).toISOString() //若已存在，则格式化
      : new Date().toISOString(); //若不存在，则使用当前时间作为备用值

    // 3.构造并返回数据传输对象
    return {
      // 基础信息
      resultId: result.resultId,
      type: 'resume_quiz',
      company: result.company,
      position: result.position,
      salaryRange: result.salaryRange, //薪资范围
      createdAt, //格式化后的创建时间

      // AI 生成的分析报告、
      // 下面的字段都是直接从数据库文档中获取的，如果某个字段不存在，则提供一个安全的默认值。
      matchScore: result.matchScore || 0, //匹配度得分，默认为0
      matchLevel: result.matchLevel || '中等', //匹配等级，默认为‘中等
      matchedSkills: result.matchedSkills || [], // 已匹配的技能列表，默认为空数组
      missingSkills: result.missingSkills || [], // 缺失的技能列表，默认为空数组
      knowledgeGaps: result.knowledgeGaps || [], // 知识盲区,默认为空数组
      //学习优先级列表，这里做了一次 .map操作以确保每个元素的结构和类型都符合 DTo的定义
      learningPriorities: (result.learningPriorities || []).map((lp) => ({
        topic: lp.topic,
        //将priority字段显式地转换为‘high’| ‘medium’| ‘low’联合类型，增强类型安全
        priority: lp.priority as 'high' | 'medium' | 'low',
        reason: lp.reason,
      })),
      radarData: result.radarData || [], //用于雷达图的数据，默认为空数组
      strengths: result.strengths || [], //优势分析，默认为空数组
      weaknesses: result.weaknesses || [], //劣势分析，默认为空数组
      summary: result.summary || '', //综合总结，默认为空字符串
      interviewTips: result.interviewTips || [], // 面试建议,默认为空数组

      // 统计信息
      // 使用可选链?.安全地获取问题数量，如果‘result.questions不存在，则返回 undefined，再通过|| 0设置为0
      totalQuestions: result.questions?.length || 0,
      questionDistribution: result.questionDistribution || {}, // 问题分布情况,默认为空对象
      viewCount: result.viewCount, //最新的查看次数
    };
  }

  // AI模拟面试评估报告
  private async generateAssessmentReportAsync() {}
}
