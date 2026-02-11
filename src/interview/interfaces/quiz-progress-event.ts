export type QuizStage = 'prepare' | 'generating' | 'saving' | 'done';

export type QuizProgressEvent =
  | {
      type: 'progress';
      progress: number; // 0-100
      label: string;
      message: string;
      stage?: QuizStage;
    }
  | {
      type: 'error';
      progress: 0;
      label: string;
      message: string;
      stage?: QuizStage;
    }
  | {
      type: 'done';
      progress: 100;
      label: string;
      message: string;
      stage: 'done';
      data: unknown;
    };
