// AI调用服务
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class InterviewAIService {
  private configService: ConfigService;

  constructor(configService: ConfigService) {
    this.configService = configService;
  }

  // 初始化模型
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
}
