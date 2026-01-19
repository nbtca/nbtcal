# SMTP 邮件功能问题评估报告

**评估日期**: 2026-01-19
**分支**: `evaluate-smtp-issues`
**评估范围**: SMTP 邮件发送功能

---

## 执行摘要

当前 SMTP 邮件实现基于 `nodemailer@6.9.16`，提供基本的邮件发送功能。虽然核心功能可用，但存在多个影响可靠性、安全性和用户体验的问题。

**关键问题数量**:
- 🔴 严重问题: 4 个
- 🟡 中等问题: 6 个
- 🟢 轻微问题: 3 个

---

## 1. 🔴 严重问题

### 1.1 缺少连接验证机制
**位置**: `src/mailer/index.ts:20-28`

**问题描述**:
```typescript
const transporter = nodemailer.createTransport({
  host: smtpConfig.host,
  port: smtpConfig.port,
  secure: smtpConfig.secure,
  auth: {
    user: smtpConfig.user,
    pass: smtpConfig.pass
  }
});
// 直接发送，没有先验证连接
await transporter.sendMail(mailOptions);
```

**影响**:
- 无法提前发现 SMTP 配置错误
- 在实际发送时才失败，浪费前期处理时间（登录、抓取课程、生成 ICS）
- 用户体验差，错误反馈太晚

**建议修复**:
```typescript
// 在发送前验证连接
await transporter.verify();
```

---

### 1.2 TLS/SSL 配置混乱
**位置**: `src/mailer/index.ts:10, 23`

**问题描述**:
```typescript
secure: process.env.SMTP_SECURE === 'true',  // 默认为 false
```

**配置问题矩阵**:

| 端口 | 正确配置 | 当前默认配置 | 问题 |
|-----|---------|-------------|------|
| 587 | `secure: false` + STARTTLS | ✅ `secure: false` | 但缺少 `requireTLS` |
| 465 | `secure: true` (SSL) | ❌ `secure: false` | 完全错误 |
| 25 | `secure: false` | ✅ `secure: false` | 但端口 25 常被屏蔽 |

**影响**:
- 使用端口 465 的用户（如 163 邮箱）无法发送邮件
- 端口 587 缺少强制 TLS，存在安全风险
- 配置文档与实际需求不匹配

**建议修复**:
```typescript
const transporter = nodemailer.createTransport({
  host: smtpConfig.host,
  port: smtpConfig.port,
  secure: smtpConfig.port === 465, // 自动判断
  requireTLS: smtpConfig.port === 587, // 强制 STARTTLS
  auth: {
    user: smtpConfig.user,
    pass: smtpConfig.pass
  }
});
```

---

### 1.3 错误处理信息不足
**位置**: `src/mailer/index.ts:46-48`

**问题描述**:
```typescript
catch (error) {
  throw new Error(`Failed to send email: ${error}`);
}
```

**问题分析**:
- 错误信息过于笼统，无法诊断具体问题
- 常见错误类型包括：
  - 认证失败 (535 Authentication failed)
  - 连接超时 (ETIMEDOUT)
  - 网络错误 (ECONNREFUSED)
  - TLS 证书错误
  - 收件人地址无效

**影响**:
- 用户无法自行诊断和解决问题
- 支持成本高

**建议修复**:
```typescript
catch (error: any) {
  const errorMap: Record<string, string> = {
    'EAUTH': 'SMTP 认证失败，请检查用户名和密码',
    'ETIMEDOUT': '连接超时，请检查 SMTP 服务器地址和端口',
    'ECONNREFUSED': '连接被拒绝，请检查端口配置或防火墙设置',
    'ESOCKET': 'TLS/SSL 握手失败，请检查 SMTP_SECURE 配置',
  };

  const code = error.code || '';
  const hint = errorMap[code] || '未知错误';

  throw new Error(`邮件发送失败: ${hint}\n详细错误: ${error.message}`);
}
```

---

### 1.4 缺少超时和重试机制
**位置**: `src/mailer/index.ts:20-28`

**问题描述**:
- 没有设置连接超时和发送超时
- 网络不稳定时可能导致长时间挂起
- 临时性失败（如网络抖动）会导致整个流程失败

**影响**:
- 在网络不佳的环境下用户体验差
- CLI 可能长时间无响应
- 降低成功率

**建议配置**:
```typescript
const transporter = nodemailer.createTransport({
  // ... 其他配置
  connectionTimeout: 10000,   // 连接超时 10 秒
  greetingTimeout: 5000,      // SMTP 握手超时 5 秒
  socketTimeout: 30000,       // 数据传输超时 30 秒
  pool: false,                // 禁用连接池（CLI 场景）
});

// 添加重试逻辑
let lastError;
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    await transporter.sendMail(mailOptions);
    return;
  } catch (error) {
    lastError = error;
    if (attempt < 3) {
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }
}
throw lastError;
```

---

## 2. 🟡 中等问题

### 2.1 类型定义不完整
**位置**: `src/types.ts:22-28`

**问题描述**:
```typescript
export interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}
```

**缺失字段**:
- `from?: string` - 发件人显示名称
- `replyTo?: string` - 回复地址
- `connectionTimeout?: number` - 连接超时
- `socketTimeout?: number` - 套接字超时
- `pool?: boolean` - 是否使用连接池
- `requireTLS?: boolean` - 是否强制 TLS

---

### 2.2 邮箱地址格式验证缺失
**位置**: `src/mailer/index.ts:5`, `src/index.ts:60-70`

**问题描述**:
```typescript
async send(config: EmailConfig): Promise<void> {
  // 没有验证 config.to 的格式
  const mailOptions = {
    to: config.to,  // 可能是无效格式
    // ...
  };
}
```

**风险**:
- 用户输入错误的邮箱地址不会被及时发现
- 直到 SMTP 服务器拒绝才报错

**建议修复**:
```typescript
function validateEmail(email: string): boolean {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

async send(config: EmailConfig): Promise<void> {
  if (!validateEmail(config.to)) {
    throw new Error(`无效的收件人邮箱地址: ${config.to}`);
  }
  // ...
}
```

---

### 2.3 缺少发送进度反馈
**位置**: `src/mailer/index.ts:43-48`

**问题描述**:
```typescript
try {
  await transporter.sendMail(mailOptions);  // 静默执行
  console.log(`Email sent successfully to ${config.to}`);
}
```

**影响**:
- 大附件（ICS 文件可能较大）发送时没有进度提示
- 用户不知道是在发送还是卡住了

**建议改进**:
```typescript
console.log('正在连接 SMTP 服务器...');
await transporter.verify();
console.log('连接成功，正在发送邮件...');
const info = await transporter.sendMail(mailOptions);
console.log(`邮件已发送到 ${config.to}`);
console.log(`消息 ID: ${info.messageId}`);
```

---

### 2.4 环境变量默认值不合理
**位置**: `src/mailer/index.ts:7-13`

**问题描述**:
```typescript
const smtpConfig: SMTPConfig = config.smtp || {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',  // Gmail 作为默认
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || ''
};
```

**问题分析**:
- Gmail 作为默认值但 Gmail 有特殊要求（应用专用密码）
- 中国用户更常用 QQ、163、阿里云等邮件服务
- 默认值可能误导用户

**建议**:
- 移除默认 SMTP 服务器，要求用户显式配置
- 或者提供配置向导/预设模板

---

### 2.5 日志输出到 console 不灵活
**位置**: `src/mailer/index.ts:45`

**问题描述**:
```typescript
console.log(`Email sent successfully to ${config.to}`);
```

**影响**:
- 作为库使用时，日志输出无法控制
- 无法集成到自定义日志系统
- 在测试环境中会产生噪音

**建议改进**:
```typescript
export interface MailServiceOptions {
  logger?: {
    info: (msg: string) => void;
    error: (msg: string) => void;
  };
}

export class MailService {
  constructor(private options?: MailServiceOptions) {}

  private log(level: 'info' | 'error', message: string) {
    if (this.options?.logger) {
      this.options.logger[level](message);
    } else if (level === 'info') {
      console.log(message);
    } else {
      console.error(message);
    }
  }

  async send(config: EmailConfig): Promise<void> {
    // ...
    this.log('info', `Email sent successfully to ${config.to}`);
  }
}
```

---

### 2.6 不支持 HTML 邮件
**位置**: `src/mailer/index.ts:30-41`, `src/types.ts:30-37`

**问题描述**:
```typescript
const mailOptions = {
  from: smtpConfig.user,
  to: config.to,
  subject: config.subject,
  text: config.body,  // 只支持纯文本
  attachments: [...]
};
```

**影响**:
- 无法发送格式化的邮件内容
- 无法添加品牌标识、链接样式等
- 用户体验不佳

**建议扩展**:
```typescript
export interface EmailConfig {
  to: string;
  subject: string;
  body: string;
  html?: string;  // 新增 HTML 内容
  attachment: Buffer;
  filename: string;
  smtp?: SMTPConfig;
}

// 使用时
const mailOptions = {
  from: smtpConfig.user,
  to: config.to,
  subject: config.subject,
  text: config.body,
  html: config.html,  // 如果提供则使用 HTML
  attachments: [...]
};
```

---

## 3. 🟢 轻微问题

### 3.1 from 字段缺少显示名称
**位置**: `src/mailer/index.ts:31`

**问题描述**:
```typescript
from: smtpConfig.user,  // 只有邮箱地址
```

**影响**:
- 收件人看到的发件人只是邮箱地址
- 缺少友好的显示名称

**建议改进**:
```typescript
from: `NBT Course Calendar <${smtpConfig.user}>`,
// 或者从配置中读取
from: smtpConfig.fromName
  ? `${smtpConfig.fromName} <${smtpConfig.user}>`
  : smtpConfig.user,
```

---

### 3.2 缺少测试覆盖
**位置**: 项目根目录

**问题描述**:
- 没有单元测试覆盖 `MailService` 类
- `test-email.ts` 是集成测试，需要真实的 SMTP 服务器
- 无法在 CI/CD 中自动化测试邮件功能

**建议**:
```typescript
// 添加单元测试
import { MailService } from '../src/mailer';
import nodemailer from 'nodemailer';

jest.mock('nodemailer');

describe('MailService', () => {
  it('should validate SMTP credentials', async () => {
    const service = new MailService();
    await expect(service.send({
      to: 'test@example.com',
      subject: 'Test',
      body: 'Test',
      attachment: Buffer.from(''),
      filename: 'test.ics',
      smtp: { host: 'smtp.test.com', port: 587, secure: false, user: '', pass: '' }
    })).rejects.toThrow('SMTP credentials not provided');
  });

  // 更多测试...
});
```

---

### 3.3 文档不完整
**位置**: `README.md`

**缺失内容**:
- 各主流邮件服务商的详细配置示例
- SMTP 故障排查指南
- 安全最佳实践（如不在代码中硬编码密码）
- 常见错误代码说明

**建议增加**:
```markdown
## 邮件服务商配置示例

### Gmail
- SMTP_HOST=smtp.gmail.com
- SMTP_PORT=587
- SMTP_SECURE=false
- 需要启用"两步验证"并生成"应用专用密码"

### QQ 邮箱
- SMTP_HOST=smtp.qq.com
- SMTP_PORT=587 或 465
- SMTP_PORT=587 时 SMTP_SECURE=false
- SMTP_PORT=465 时 SMTP_SECURE=true
- 需要在 QQ 邮箱设置中开启 SMTP 服务并获取授权码

### 163 邮箱
- SMTP_HOST=smtp.163.com
- SMTP_PORT=465
- SMTP_SECURE=true
- 需要在网易邮箱设置中开启 SMTP 服务并获取授权码

## 故障排查

### 错误: EAUTH - 认证失败
- 检查 SMTP_USER 和 SMTP_PASS 是否正确
- Gmail 用户需使用应用专用密码，不是账户密码
- QQ/163 用户需使用授权码，不是邮箱密码

### 错误: ETIMEDOUT - 连接超时
- 检查 SMTP_HOST 和 SMTP_PORT 是否正确
- 检查防火墙是否阻止了 SMTP 端口
- 尝试使用其他网络环境

### 错误: ESOCKET - TLS 错误
- 检查 SMTP_SECURE 配置是否与端口匹配
- 端口 587 应使用 SMTP_SECURE=false
- 端口 465 应使用 SMTP_SECURE=true
```

---

## 4. 架构建议

### 4.1 引入邮件队列
**场景**: 如果未来需要批量发送或定时发送

**建议方案**:
- 使用 Bull 或 BullMQ 实现任务队列
- 支持失败重试、优先级队列
- 可监控发送状态

---

### 4.2 支持多种传输方式
**场景**: 不同环境使用不同的邮件服务

**建议方案**:
```typescript
export interface MailTransport {
  send(config: EmailConfig): Promise<void>;
}

export class SMTPTransport implements MailTransport {
  // 当前实现
}

export class SendGridTransport implements MailTransport {
  // 使用 SendGrid API
}

export class MockTransport implements MailTransport {
  // 测试环境使用
}
```

---

### 4.3 配置验证和向导
**场景**: 提升用户配置体验

**建议实现**:
```bash
$ nbtcal setup-email

? 选择邮件服务商:
  > Gmail
    QQ Mail
    163 Mail
    Outlook
    自定义

? 请输入邮箱地址: user@gmail.com
? 请输入密码/授权码: ********

✓ 正在测试 SMTP 连接...
✓ 连接成功！
✓ 配置已保存到 .env
```

---

## 5. 优先级建议

### 立即修复（影响功能可用性）:
1. ✅ TLS/SSL 配置修复 (1.2)
2. ✅ 错误处理改进 (1.3)
3. ✅ 邮箱地址验证 (2.2)

### 短期优化（提升稳定性）:
1. ✅ 连接验证机制 (1.1)
2. ✅ 超时和重试 (1.4)
3. ✅ 进度反馈 (2.3)

### 中期改进（提升体验）:
1. ✅ HTML 邮件支持 (2.6)
2. ✅ 日志系统改进 (2.5)
3. ✅ 类型定义完善 (2.1)
4. ✅ 文档完善 (3.3)

### 长期规划（架构优化）:
1. ✅ 测试覆盖 (3.2)
2. ✅ 配置向导 (4.3)
3. ✅ 多传输方式 (4.2)

---

## 6. 总结

当前 SMTP 实现能够完成基本的邮件发送任务，但在生产环境中可能会遇到以下主要问题：

1. **可靠性不足**: 缺少连接验证、超时控制和重试机制
2. **安全配置复杂**: TLS/SSL 配置容易出错，特别是不同端口的场景
3. **错误诊断困难**: 错误信息不够详细，用户难以自行排查
4. **用户体验欠佳**: 缺少进度反馈、邮件格式单一

建议优先修复严重问题 1.2、1.3、1.4，然后逐步改进中等问题，以提高整体的稳定性和可用性。

---

**评估人**: Claude Code
**下一步**: 根据优先级逐项修复问题并提交 PR
