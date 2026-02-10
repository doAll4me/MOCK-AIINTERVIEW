import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AIModule } from 'src/ai/ai.module';
import { UserModule } from 'src/user/user.module';
import { InterviewController } from './interview.controller';
import { DocumentParserService } from './services/document-parser.service';
import { InterviewAIService } from './services/interview-ai.service';
import { InterviewService } from './services/interview.service';

@Module({
  imports: [
    ConfigModule, //方便后续调用API ，需要环境变量中的key
    // 需要访问多个数据表，后续
    MongooseModule.forFeature([
      // ·ConsumptionRecord - 消费记录
      // ·ResumeQuizResult -简历押题结果
      // ·AllnterviewResult - 模拟面试结果
      // ·User-用户表
      // ·UserTransaction -用户充值记录
      // -Resume-简历表
      // ·UploadedResume -上传的简历文件
    ]),
    UserModule,
    AIModule,
  ],
  controllers: [InterviewController],
  providers: [InterviewService, InterviewAIService, DocumentParserService],
  exports: [InterviewService, InterviewAIService, DocumentParserService],
})
export class InterviewModule {}
