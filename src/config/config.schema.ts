// validationSchema：环境变量的「入库校验」
// 在应用启动时，校验 .env 里的变量是否“合法”
import * as Joi from 'joi';

/**
 * 缺少变量 → 应用直接启动失败
 * 类型错误 → 启动失败
 * 值不合法 → 启动失败
 */
export const configValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  MONGODB_URI: Joi.string().required(),
  JWT_SECRET: Joi.string().required().min(3),
  DEEPSEEK_API_KEY: Joi.string().required(),
  DEEPSEEK_MODEL: Joi.string().default('deepseek-chat'),
  MAX_TOKENS: Joi.number().default(4000),
});
