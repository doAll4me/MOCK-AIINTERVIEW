export interface ConsumptionRecord {
  recordId: string; //消费记录ID
  userId: string; //用户ID
  type: 'resume_quiz' | ' '; //消费类型
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED'; //状态
  consumedCount: number; //消费次数

  // 关键，用于幂等性检查
  metadata: {
    requestId: string; //前端发送的请求id
    promptVersion: string;
  };

  resultId: string;
  startedAt: Date;
  completedAt?: Date;
}

// 消费类型枚举
export enum ConsumptionType {
  RESUME_QUIZ = 'resume_quiz', //简历押题
  SPECIAL_INTERVIEW = 'special_interview', //专项面试
  BEHAVIOR_INTERVIEW = 'behavior_interview', //综合面试
  AI_INTERVIEW = 'ai_interview', //AI模拟面试
}
