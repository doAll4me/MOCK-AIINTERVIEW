// 定义数据结构
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Document } from 'mongoose';

// export type UserDocument = HydratedDocument<User> & {
//   comparePassword(password: string): Promise<boolean>;
// };

export type UserDocument = User &
  Document & {
    comparePassword(candidatePassword: string): Promise<boolean>;
  };

type PublicUser = Omit<User, 'password'> & {
  _id?: unknown;
  id?: string;
};

// profile的schema
@Schema({ _id: false })
export class Profile {
  @Prop()
  bio: string;

  @Prop()
  phone: string;

  @Prop()
  avatar: string; //头像URL
}
// const ProfileSchema = SchemaFactory.createForClass(Profile);

// 地址的schema（子类
// @Schema({ _id: false })
// export class Address {
//   @Prop()
//   country: string;

//   @Prop()
//   city: string;

//   @Prop()
//   street: string;

//   @Prop()
//   zipcode: string;
// }
// const AddressSchema = SchemaFactory.createForClass(Address);

@Schema({ timestamps: true }) //说明这个类是Schema，即数据的“结构说明书 / 规则模板”
// extends Document,继承自Document，保证User里有MongoDB文档中的所有属性
export class User {
  // 基础认证字段
  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    minlength: 3,
    maxlength: 20,
    // validate: {
    //   validator: function (v: string) {
    //     // 用户名不能包含敏感词汇
    //     const bannedWords = ['admin', 'root', 'system'];
    //     return !bannedWords.includes(v.toLowerCase());
    //   },
    //   message: '用户名包含被禁止的词汇',
    // },
    index: true,
  }) //定义一个属性
  username: string;

  @Prop({ required: false })
  wechatId: string; //微信登录的唯一标识符

  @Prop({
    required: false,
    unique: true,
    lowercase: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  })
  email?: string;

  @Prop({ required: false })
  phone: string;

  @Prop()
  avatar?: string;

  @Prop({ default: ['user'] })
  roles: string[]; //角色数组，支持多角色

  @Prop({ default: false })
  isActive: boolean; //账号是否激活

  @Prop({ required: true })
  password: string;

  // 用户个人信息
  @Prop()
  realName?: string;

  @Prop({ enum: ['male', 'female', 'other'], default: 'other' })
  gender?: 'male' | 'female' | 'other'; //性别

  @Prop()
  idCard?: string; //身份证号

  @Prop({ default: false })
  isVerified: boolean; //是否实名认证

  @Prop()
  birthDate?: Date;

  // 会员相关
  @Prop({ default: false })
  isVip: boolean; //是否为会员

  @Prop()
  vipExpireTime?: Date; //会员过期时间

  // 配额相关
  @Prop({ default: 0 })
  aiInterviewRemainingCount: number; //AI模拟面试剩余次数

  @Prop({ default: 0 })
  aiInterviewRemainingMinutes: number; //AI模拟面试剩余时间

  @Prop({ default: 0 })
  wwCoinBalance: number; //旺旺币余额

  @Prop({ default: 0 })
  resumeRemainingCount: number; //简历押题剩余次数

  @Prop({ default: 0 })
  specialRemainingCount: number; //专项面试剩余次数

  @Prop({ default: 0 })
  behaviorRemainingCount: number; //综合面试剩余次数

  //用户行为追踪
  @Prop()
  lastLoginTime?: Date; //最近登录时间

  // 微信相关字段
  @Prop({ unique: true, sparse: true }) //加上sparse: true后，MongoDB在创建索引时会忽略null和不存在的值
  openid?: string; //微信用户唯一标识（小程序

  @Prop({ unique: true, sparse: true })
  unionid?: string; //微信开放平台统一标识

  @Prop()
  wechatNickname?: string; //微信昵称

  @Prop()
  wechatAvatar?: string; //微信头像

  @Prop({ default: false })
  isWechatBound: boolean; //是否绑定微信

  @Prop()
  wechatBoundTime?: Date; //微信绑定时间

  // @Prop({ type: ProfileSchema })
  // profile: Profile;

  // @Prop({ type: [String], default: [] })
  // tags: string[];

  // // @Prop({ type: Number, min: 0, max: 150 })
  // // age: number;

  // // @Prop({ type: AddressSchema })
  // // address: Address;

  // // @Prop({ default: Date.now })
  // // createdAt: Date;

  @Prop({
    type: String,
    enum: ['active', 'inactive', 'banned'],
    default: 'active',
    index: true,
  })
  status: string;

  // @Prop({
  //   type: Boolean,
  //   default: false,
  // })
  // isAdmin: boolean;

  // @Prop({ type: Number, default: 0 })
  // loginCount: number;

  // @Prop()
  // lastLoginAt: Date;

  // // 虚拟字段：账号是否处于活跃状态
  // // readonly isActive: boolean;
  // readonly createdAt: Date;
  // readonly updateAt: Date;
}
export const UserSchema = SchemaFactory.createForClass(User); // 导出一个Mongoose Schema 对象

// 添加虚拟字段
// UserSchema.virtual('isActive').get(function () {
//   return this.status === 'active';
// });

// 创建索引
UserSchema.index({ username: 1, email: 1 });
UserSchema.index({ status: 1 });

// preSave 钩子：保存前 加密密码
UserSchema.pre('save', async function () {
  // 如果密码没有修改 就不用重新加密
  if (!this.isModified('password')) {
    return;
  }

  try {
    // 生成盐
    const salt = await bcrypt.genSalt(10);
    if (this.password) {
      // 用盐加密bcrypt.hash(plainPassword, saltRounds),saltRounds是生成盐计算强度（越高越安全 但一般用10
      this.password = await bcrypt.hash(this.password, salt);
    }
  } catch (error) {
    return new Error('抛出错误', error);
  }
});

// 添加方法：比对密码
UserSchema.methods.comparePassword = async function (
  this: UserDocument,
  candidatePassword: string,
): Promise<boolean> {
  return await bcrypt.compare(candidatePassword, this.password);
};

// 响应时不显示密码
UserSchema.set('toJSON', {
  transform: (_doc: unknown, ret: unknown): PublicUser => {
    const obj = ret as Record<string, unknown>;
    delete obj.password;
    return obj as unknown as PublicUser;
  },
});

// 添加Post save 钩子：保存后打印日志
UserSchema.post('save', function () {
  console.log(`用户${this.username}已保存`);
});

// Pre findOneAndUpdate 钩子：自动更新时间戳
UserSchema.pre('findOneAndUpdate', function () {
  this.set({ updateAt: new Date() });
});

// 添加方法：隐藏敏感字段
UserSchema.methods.toJSON = function (this: UserDocument) {
  const obj = this.toObject() as unknown as Record<string, unknown>;
  delete obj.password;
  return obj;
};
