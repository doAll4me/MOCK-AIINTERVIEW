import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';

export type ConsumptionRecordDocument = ConsumptionRecord & Document;

// 消费类型枚举
export enum ConsumptionType {
  RESUM_QUIZ = 'resume_quiz', //简历押题
  SPECIAL_INTERVIEW = 'special_interview', //专项面试
  BEHAVIOR_INTERVIEW = 'behavior_interview', //综合面试
  AI_INTERVIEW = 'ai_interview', //AI模拟面试
}

// 消费状态枚举
export enum ConsumptionStatus {
  PENDING = 'pending', //处理中
  SUCCESS = 'success', //成功
  FAILED = 'failed', //失败（退款
  CANCELLED = 'cancelled', //用户取消
}

// 消费记录schema
// 用于记录用户所有的功能消费
@Schema({ timestamps: true })
export class ConsumptionRecord {
  // =======基础信息和标识=======
  @Prop({ required: true, unique: true })
  recordId: string; //消费记录唯一ID

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  user: Types.ObjectId; //MongoDB的ObjectID，用于关联用户

  @Prop({ required: true, index: true })
  userId: string; //用户ID，字符串，用于条件查询

  @Prop({ required: true, enum: ConsumptionType, index: true })
  type: ConsumptionType; //消费类型

  @Prop({
    required: true,
    enum: ConsumptionStatus,
    default: ConsumptionStatus.PENDING,
  })
  status: ConsumptionStatus; //消费状态

  @Prop({ required: true })
  consumedCount: number; //消费的次数

  @Prop()
  description?: string; //消费描述

  @Prop()
  createdAt: Date; //订单创建时间

  //========输入数据=========
  @Prop({ type: SchemaTypes.Mixed })
  inputData?: Record<string, any>; //用户输入的数据（公司、岗位、简历等

  // =======输出数据==========
  @Prop({ type: SchemaTypes.Mixed })
  outputData?: Record<string, any>; //AI生成结果

  @Prop()
  resultId?: string; //关联的结果ID

  // =======AI调用相关=========
  @Prop()
  aiModel?: string; //使用的AI模型

  @Prop()
  promptTokens?: number; //输入的token数

  @Prop()
  completionTokens?: number; //输出token数

  @Prop()
  totalTokens?: number; //总token数

  @Prop()
  estimatedCost?: number; //预估成本

  @Prop()
  aiResponseTime?: number; //AI响应时间（ms

  // =======时间记录=========
  @Prop({ default: Date.now })
  statedAt: Date; //开始处理的时间

  @Prop()
  completedAt?: Date; //完成时间

  @Prop()
  failedAt?: Date; //失败时间

  //=======失败处理=========
  @Prop()
  errorMessage?: string; //错误信息

  @Prop()
  errotStack?: string; //错误堆栈（开发环境

  @Prop({ default: false })
  isRefunded: boolean; //是否已退款

  @Prop()
  refundedAt: Date; //退款时间

  // =======元数据=========
  @Prop({ type: SchemaTypes.Mixed })
  metadata?: Record<string, any>; //其他元数据

  @Prop()
  requestId?: string; //请求ID（用于幂等性

  @Prop()
  userAgent?: string; //用户代理

  @Prop()
  ipAddress?: string; //IP地址
}

export const ConsumptionRecordSchema =
  SchemaFactory.createForClass(ConsumptionRecord);

// 创建复合索引
ConsumptionRecordSchema.index({ userId: 1, type: 1, createdAt: -1 });
ConsumptionRecordSchema.index({ userId: 1, status: 1 });
ConsumptionRecordSchema.index({ requestId: 1 }, { sparse: true });
