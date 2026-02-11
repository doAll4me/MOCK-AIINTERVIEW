import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

// 简历押题请求DTO
export class ResumeQuizDto {
  @ApiProperty({
    description: '公司名称',
    example: '字节跳动',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  company?: string;

  @ApiProperty({
    description: '岗位名称',
    example: '前端开发工程师',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  positionName: string;

  @ApiProperty({
    description: '最低薪资（单位：K）',
    example: 20,
    required: false,
  })
  @IsNumber()
  @Min(0)
  @Max(9999)
  @IsOptional()
  minSalary?: number;

  @ApiProperty({
    description: '最高薪资（单位：K）',
    example: 35,
    required: false,
  })
  @IsNumber()
  @Min(0)
  @Max(9999)
  @IsOptional()
  maxSalary?: number;

  @ApiProperty({
    description: '职位描述（JD）',
    example: '负责前端架构设计...',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(50)
  @MaxLength(2000)
  jd: string;

  @ApiProperty({
    description: '简历ID（从简历列表中选择）',
    required: false,
  })
  @IsString()
  @IsOptional()
  resumeId?: string;

  @ApiProperty({
    description: '简历内容（直接传递文本）',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(10000)
  resumeContent?: string;

  @ApiProperty({
    description: '请求ID（用于幂等性）',
    required: false,
  })
  @IsUUID('4')
  @IsOptional()
  requestId?: string;

  @ApiProperty({
    description: 'Prompt版本（用于A/B测试）',
    example: 'v2',
    required: false,
  })
  @IsString()
  @IsOptional()
  promptVersion?: string;
}
