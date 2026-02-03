import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Module({
  providers: [
    {
      // 注册一个 自定义 Provider
      provide: 'DATABASE_CONNECTION',
      // 用函数创建依赖
      useFactory: (configService: ConfigService) => {
        // 从配置里读 DB_TYPE，默认 mongodb
        const dbType = configService.get<string>('DB_TYPE', 'mongodb');

        // 根据 dbType 返回不同配置对象
        if (dbType === 'mongodb') {
          return {
            type: 'mongodb',
            uri: configService.get<string>('MONGODB_URI'),
          };
        } else if (dbType === 'postgres') {
          return {
            type: 'postgres',
            host: configService.get<string>('POSTGRES_HOST'),
            port: configService.get<string>('POSTGRES_PORT'),
            database: configService.get<string>('POSTGRES_DB'),
          };
        }

        throw new Error(`不支持数据库类型：${dbType}`);
      },
      inject: [ConfigService], //这个工厂函数需要的依赖
    },
  ],
  exports: ['DATABASE_CONNECTION'], //把这个 provider 导出去给别的模块用
})
export class DatabaseModule {}
