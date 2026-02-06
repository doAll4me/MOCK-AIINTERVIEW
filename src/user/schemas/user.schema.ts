import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Document, HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User> & {
  comparePassword(password: string): Promise<boolean>;
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
const ProfileSchema = SchemaFactory.createForClass(Profile);

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

@Schema() //说明这个类是Schema，即数据的“结构说明书 / 规则模板”
// extends Document,继承自Document，保证User里有MongoDB文档中的所有属性
export class User extends Document {
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

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  })
  email: string;

  @Prop({ required: true, minlength: 6 })
  password: string;

  @Prop({ type: ProfileSchema })
  profile: Profile;

  @Prop({ type: [String], default: [] })
  tags: string[];

  // @Prop({ type: Number, min: 0, max: 150 })
  // age: number;

  // @Prop({ type: AddressSchema })
  // address: Address;

  // @Prop({ default: Date.now })
  // createdAt: Date;

  @Prop({
    type: String,
    enum: ['active', 'inactive', 'banned'],
    default: 'active',
    index: true,
  })
  status: string;

  @Prop({
    type: Boolean,
    default: false,
  })
  isAdmin: boolean;

  @Prop({ type: Number, default: 0 })
  loginCount: number;

  @Prop()
  lastLoginAt: Date;

  // 虚拟字段：账号是否处于活跃状态
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updateAt: Date;
}
export const UserSchema = SchemaFactory.createForClass(User); // 导出一个Mongoose Schema 对象

// 添加虚拟字段
UserSchema.virtual('isActive').get(function () {
  return this.status === 'active';
});

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
    // 用盐加密
    this.password = await bcrypt.hash(this.password, salt);
  } catch (error) {
    return new Error('抛出错误', error);
  }
});

// 添加Post save 钩子：保存后打印日志
UserSchema.post('save', function () {
  console.log(`用户${this.username}已保存`);
});

// Pre findOneAndUpdate 钩子：自动更新时间戳
UserSchema.pre('findOneAndUpdate', function () {
  this.set({ updateAt: new Date() });
});

// 添加方法：比对密码
UserSchema.methods.comparePassword = async function (
  this: UserDocument,
  password: string,
) {
  return bcrypt.compare(password, this.password);
};

// 添加方法：隐藏敏感字段
UserSchema.methods.toJSON = function (this: UserDocument) {
  const obj = this.toObject() as unknown as Record<string, unknown>;
  delete obj.password;
  return obj;
};
