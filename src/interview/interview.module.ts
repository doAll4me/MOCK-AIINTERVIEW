import { Module } from '@nestjs/common';
import { EventService } from 'src/common/services/event.service';
import { UserModule } from 'src/user/user.module';
import { InterviewController } from './interview.controller';
import { InterviewService } from './interview.service';

@Module({
  imports: [UserModule],
  controllers: [InterviewController],
  providers: [InterviewService, EventService],
})
export class InterviewModule {}
