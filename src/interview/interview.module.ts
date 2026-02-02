import { Module } from '@nestjs/common';
import { UserModule } from 'src/user/user.module';
import { InterviewController } from './interview.controller';
import { InterviewService } from './interview.service';

@Module({
  imports: [UserModule],
  controllers: [InterviewController],
  providers: [InterviewService],
})
export class InterviewModule {}
