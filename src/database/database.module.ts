import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseService } from './database.service';

@Module({
  imports: [
    //确保能注入configService(在 AppModule里已经把ConfigModule设为global，这里写不写imports都可以，但写上更清晰)
    ConfigModule,
  ],
  providers: [
    DatabaseService,
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
  exports: ['DATABASE_CONNECTION', DatabaseService], //把这个 provider 导出去给别的模块用
})
export class DatabaseModule {}
