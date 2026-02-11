import { JsonOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import { Injectable, Logger } from '@nestjs/common';
import { AIModelFactory } from 'src/ai/services/ai-model.factory';
import { RESUME_ANALYSIS_PROMPT } from '../prompts/resume-analysis.prompts';

/**
 * 简历分析服务
 *
 * 这个服务负责简历分析的AIchain。
 *  -管理简历分析的Prompt
 *  -初始化分析chain
 *  -调用 AI 进行分析
 *
 * 为什么要单独提取这个服务?
 * 因为简历分析涉及特定的Prompt 和chain，将来可能还有其他分析(编程题分析、答题分析等)。
 * 每个分析都有自己的 Prompt 和chain，所以我们为每个分析创建一个独立的服务。
 *
 * InterviewService只关心会话管理，不关心具体的分析逻辑。
 */
@Injectable()
export class ResumeAnalysisService {
  private readonly logger = new Logger(ResumeAnalysisService.name);

  constructor(private aiModelFactory: AIModelFactory) {}

  /**
   * 分析简历
   *
   * @param resumeContent 简历内容
   * @param jobDescription 岗位描述
   * @returns 分析结果（json对象
   */
  async analyze(resumeContent: string, jobDescription: string): Promise<any> {
    // 1.创建prompt模版
    const prompt = PromptTemplate.fromTemplate(RESUME_ANALYSIS_PROMPT);

    // 2.获取模型
    const model = this.aiModelFactory.createDefaultModel();

    // 3.创建输出解释器
    const parser = new JsonOutputParser();

    // 4.组建链
    const chain = prompt.pipe(model).pipe(parser);

    try {
      this.logger.log('开始简历分析');

      // 5.调用链
      const result = await chain.invoke({
        resume_content: resumeContent,
        job_description: jobDescription,
      });

      this.logger.log('简历分析完成');
      return result;
    } catch (error) {
      this.logger.error('简历分析失败', error);
      throw error;
    }
  }
}
