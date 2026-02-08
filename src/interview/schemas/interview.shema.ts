import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

// interview的schema
@Schema({ _id: false, timestamps: true }) // 添加 timestamps 自动管理 createdAt 和 updatedAt
export class Interview {
  @Prop({ required: true, maxlength: 500 }) // 添加验证规则
  bio: string;

  @Prop({
    required: true,
    match: [/^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/, '请输入有效的电话号码'], // 添加电话号码格式验证
  })
  phone: string;

  @Prop({
    required: true,
    match: [/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i, '请输入有效的图片URL'], // 验证图片URL格式
  })
  avatar: string; // 头像URL

  // 可以添加更多字段
  @Prop({ default: 'pending' }) // 默认值
  status: 'pending' | 'approved' | 'rejected';

  @Prop({ type: Date })
  interviewDate: Date;

  @Prop()
  interviewer: string;

  @Prop({ type: Object })
  ratings: {
    communication: number;
    technical: number;
    problemSolving: number;
  };

  @Prop()
  notes: string;
}

const InterviewSchema = SchemaFactory.createForClass(Interview);

InterviewSchema.index({ user_id: 1 });
InterviewSchema.index({ createdAt: -1 });
InterviewSchema.index({ uer_id: 1, createdAt: -1 });
