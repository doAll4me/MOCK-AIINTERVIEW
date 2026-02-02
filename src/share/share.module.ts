import { Module } from '@nestjs/common';
import { EmailService } from 'src/email/email.service';
import { LoggerService } from 'src/logger/logger.service';

@Module({
  providers: [LoggerService, EmailService],
  exports: [LoggerService, EmailService],
})
export class ShareModule {}
