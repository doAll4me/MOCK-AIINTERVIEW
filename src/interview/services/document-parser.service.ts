// 文档解析服务
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as mammoth from 'mammoth';
import * as pdf from 'pdf-parse';

/**
 * 文档解析服务
 * 支持从url下载并解析PDF、DOCX等格式文件
 */
@Injectable()
export class DocumentParserService {
  private readonly logger = new Logger(DocumentParserService.name);

  // 支持的文件类型
  private readonly SUPPORTED_TYPES = {
    PDF: ['.pdf'],
    DOCX: ['.docx', '.doc'],
  };

  // 最大文件大小（10mb
  private readonly MAX_FILE_SIZE = 10 * 1023 * 1024;

  /**
   * 从URL下载并解析文档
   *
   * @param url 文件url地址
   * @returns 解析后的文本内容
   */
  async parseDocumentFromUrl(url: string): Promise<string> {
    try {
      this.logger.log(`开始解析文档：${url}`);

      // 1.验证URL
      this.validateUrl(url);

      // 2.下载文件
      const buffer = await this.downLoadFile(url);

      // 3.根据文件类型解析
      const fileType = this.getFileType(url);
      let text: string;

      switch (fileType) {
        case 'PDF':
          text = await this.parsePdf(buffer);
          break;

        case 'DOCX':
          text = await this.parseDocx(buffer);
          break;
        default:
          throw new BadRequestException(
            '不支持的文件格式，当前仅支持：PDF，DOCX',
          );
      }

      this.logger.log(`文档解析成功：长度=${text.length}字符`);

      return text;
    } catch (error) {
      this.logger.error(`文档解析失败：${error.message}`, error.stack);
      throw error;
    }
  }

  // 验证URL
  private validateUrl(url: string): void {
    if (!url) throw new BadRequestException('URL不能为空');

    try {
      new URL(url);
    } catch (error) {
      throw new BadRequestException('URL格式不正确');
    }

    // 检查文件拓展名
    const fileType = this.getFileType(url);
    if (!fileType)
      throw new BadRequestException(
        `不支持的文件格式。支持的格式：${Object.values(this.SUPPORTED_TYPES).flat().join('、')}`,
      );
  }

  // 获取文件类型（后缀
  private getFileType(url: string): 'PDF' | 'DOCX' | null {
    const urlLower = url.toLowerCase();

    for (const [type, extension] of Object.entries(this.SUPPORTED_TYPES)) {
      for (const ext of extension) {
        if (urlLower.includes(ext)) return type as 'PDF' | 'DOCX';
      }
    }
    return null;
  }

  // 下载文件
  private async downLoadFile(url: string): Promise<Buffer> {
    try {
      this.logger.log(`开始下载文件：${url}`);

      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000, //30秒超时
        maxContentLength: this.MAX_FILE_SIZE,
        maxBodyLength: this.MAX_FILE_SIZE,
        headers: { 'User-Agent': 'Mozilla/5.0(compatible;ResumeParser/1.0' },
      });

      const buffer = Buffer.from(response.data);

      // 验证文件大小
      if (buffer.length > this.MAX_FILE_SIZE) {
        throw new BadRequestException(
          `文件过大（${(buffer.length / 1024 / 1024).toFixed(2)}MB），最大支持10MB`,
        );
      }

      // 验证文件内容不为空
      if (buffer.length === 0) {
        throw new BadRequestException(`文件为空`);
      }

      this.logger.log(
        `文件下载成功：大小=${(buffer.length / 1024).toFixed(2)}KB`,
      );

      return buffer;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;

      if (error.code === 'ECONNABORTED')
        throw new BadRequestException('文件下载超时，请检查网络或文件地址');

      if (error.response?.status === 404)
        throw new BadRequestException('文件不存在或已被删除');

      if (error.response?.status === 403)
        throw new BadRequestException('无权访问该文件，请检查文件权限');

      throw new BadRequestException(
        `文件下载失败：${error.messasge || '未知错误'}`,
      );
    }
  }

  // 解析PDF文件
  private async parsePdf(buffer: Buffer): Promise<string> {
    try {
      this.logger.log(`开始解析PDF文件`);

      const data = await pdf.default(buffer);

      if (!data.text || data.text.trim().length === 0) {
        throw new BadRequestException(
          `PDF文件无法提取文本内容。可能原因：` +
            `\n1.PDF是图片格式（需要OCR）` +
            `\n2.PDF已加密或受保护` +
            `\n3.PDF文件损坏`,
        );
      }

      this.logger.log(
        `PDF解析成功：页数=${data.numpages}，长度=${data.text.length}`,
      );

      return data.text;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;

      this.logger.error(`PDF解析失败：${error.message}`, error.stack);
      throw new BadRequestException(
        `PDF文件解析失败：${error.message}。请确保文件未加密且未损坏`,
      );
    }
  }

  /**
   * 解析docx文件
   * @param buffer 上传的 Docx 文件内的 Buffer
   * @returns 解析出的文本内容
   * @throws {BadRequestException} 如果文件为空、格式不正确或解析失败，抛出异常
   */
  private async parseDocx(buffer: Buffer): Promise<string> {
    try {
      // 记录开始解析的日志
      this.logger.log(`开始解析DOCX文件`);

      // 使用mammoth库提取DOCX文件中的纯文本内容
      const result = await mammoth.extractRawText({ buffer });

      // 如果解析结果为空或没有提取到任何文本，则抛出BadRequestException
      if (!result.value || result.value.trim().length === 0) {
        throw new BadRequestException(
          `Docx文件无法提取文本内容。可能原因：` +
            `\n1.文件为空` +
            `\n2.文件格式不正确` +
            `\n3.文件已损坏`,
        );
      }

      // 如果解析过程中有任何警告信息，记录下来
      if (result.messages && result.messages.length) {
        this.logger.warn(
          `DOCX解析警告：${result.messages.map((m) => m.message).join(',')}`,
        );
      }

      //记录解析成功的日志，并附上提取文本的长度
      this.logger.log(`PDF解析成功：长度=${result.value.length}`);

      // 返回提取的文本内容
      return result.value;
    } catch (error) {
      // 如果是已知BadRequestException错误，直接抛出
      if (error instanceof BadRequestException) throw error;

      // 其他错误记录信息日志并抛出通用错误提示
      this.logger.error(`DOCX解析失败：${error.message}`, error.stack);
      throw new BadRequestException(
        `DOCX文件解析失败：${error.message}。请确保文件格式正确且未损坏`,
      );
    }
  }

  // 清理文本内容，去除多余空白、特殊字符
  cleanText(text: string): string {
    if (!text) return '';

    return (
      text
        // 1.统一换行符
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        // 去除文字中间的多余空格
        .replace(/\s+/g, '')
        //2.去除多余的空行(保留最多2个连续换行)
        .replace(/\n{3,}/g, '\n\n')
        //3.去除行首行尾空白
        .split('\n')
        .map((line) => line.trim())
        .join('\n')
        //4.去除特殊的unicode控制字符
        .replace(/[\uFEFF\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, ' ')
        //5.统一空格(去除多余空格)
        .replace(/ {2,}/g, ' ')
        //6.去除页眉页脚常见标记
        .replace(/第\s*\d+\s*页/g, ' ')
        .replace(/Page\s+\d+/gi, ' ')
        //7.整体trim
        .trim()
    );
  }

  /**
   * 估算token数量（大致估算
   * 中文：约1.5-2字符=1token
   * 英文：约4字符=1token
   */
  estimateTokens(text: string): number {
    if (!text) return 0;

    // 统计中文字符
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    // 统计英文单词数
    const englishChars = (text.match(/[a-zA-Z]+/g) || []).length;
    // 其他字符
    const otherChars = text.length - chineseChars - englishChars;

    // 预估token
    const chineseTokens = chineseChars / 1.5; //中文字符
    const englishTokens = englishChars; //英文单词
    const otherTokens = otherChars / 4; //其他字符

    return Math.ceil(chineseTokens + englishTokens + otherTokens);
  }

  // 验证文本内容质量，检查文本是否符合简历的基本特征
  validateResumeContent(text: string): {
    isValid: boolean;
    reason?: string;
    warnings?: string[];
  } {
    const warnings: string[] = [];

    // 1.长度检查
    if (text.length < 100)
      return {
        isValid: false,
        reason: '简历内容过短（少于100字符），可能解析不完整',
      };

    if (text.length > 20000)
      warnings.push(`简历内容较长(${text.length}字符)，可能影响处理速度`);

    // 2.关键信息检查
    const resumeKeywords = [
      // 个人信息
      '姓名',
      '性别',
      '年龄',
      '手机',
      '电话',
      '邮箱',
      'email',
      '微信',

      // 教育经历
      '教育',
      '学历',
      '毕业',
      '大学',
      '学院',
      '专业',

      // 工作经历
      '工作',
      '经验',
      '项目',
      '公司',
      '职位',
      '岗位',

      // 技能
      '技能',
      '能力',
      '掌握',
      '熟悉',
      '精通',
    ];

    const foundKeywords = resumeKeywords.filter((keyword) =>
      text.includes(keyword),
    );

    if (foundKeywords.length < 3)
      warnings.push(
        '简历内容可能不完整，缺少常见的关键信息（如：姓名、教育、工作经验等）',
      );

    // 3.格式检查
    const lines = text.split('\n').filter((line) => line.trim().length > 0);
    if (lines.length < 5) warnings.push('简历格式可能有问题，内容行数过少');

    return {
      isValid: true,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
}
