/**
 * Internationalization support for English and Simplified Chinese
 * 国际化支持：英文和简体中文
 */

export type Language = 'en' | 'zh-CN';

interface Messages {
  // CLI messages
  cliTitle: string;
  cliDivider: string;
  promptStudentId: string;
  promptPassword: string;
  promptStartDate: string;
  promptEmail: string;
  validationStudentIdRequired: string;
  validationPasswordRequired: string;
  validationInvalidDate: string;
  validationInvalidEmail: string;

  // Email mode messages
  usingCloudEmail: string;
  smtpModeError: string;
  smtpModeErrorHelp: string;
  smtpConfigInstructions: string[];

  // Process steps
  step1Authenticating: string;
  step1Success: string;
  step2Accessing: string;
  step2Success: string;
  step3Fetching: string;
  step3AutoDetected: string;
  step3FoundCourses: string;
  step4Converting: string;
  step4Generated: string;
  step5Sending: string;
  step5Success: string;

  // Success/Error messages
  finalSuccess: string;
  errorPrefix: string;

  // Email sending
  emailSentSuccess: string;
  emailMessageId: string;
  emailFailedWarning: string;
  emailSavedLocally: string;
  emailImportManually: string;

  // Errors
  noCourses: string;
}

const translations: Record<Language, Messages> = {
  'en': {
    // CLI messages
    cliTitle: '\n@nbtca/nbtcal - Course Schedule Exporter',
    cliDivider: '========================================\n',
    promptStudentId: 'Student ID:',
    promptPassword: 'Password:',
    promptStartDate: 'Semester start date (YYYY-MM-DD):',
    promptEmail: 'Recipient email address (where to send the schedule):',
    validationStudentIdRequired: 'Student ID is required',
    validationPasswordRequired: 'Password is required',
    validationInvalidDate: 'Invalid date format (use YYYY-MM-DD)',
    validationInvalidEmail: 'Invalid email',

    // Email mode messages
    usingCloudEmail: '📧 Using cloud email service (no SMTP configuration needed)\n',
    smtpModeError: '\n❌ Error: SMTP mode requires SMTP_USER and SMTP_PASS environment variables.',
    smtpModeErrorHelp: 'Or switch to API mode: unset EMAIL_MODE or set EMAIL_MODE=api\n',
    smtpConfigInstructions: [
      '\nPlease set the following environment variables:',
      '  SMTP_HOST="smtp.gmail.com"          # SMTP server (optional, defaults to Gmail)',
      '  SMTP_PORT="587"                     # SMTP port (optional, defaults to 587)',
      '  SMTP_SECURE="false"                 # Use SSL/TLS (optional, defaults to false)',
      '  SMTP_USER="your-email@example.com"  # Required',
      '  SMTP_PASS="your-app-password"       # Required\n'
    ],

    // Process steps
    step1Authenticating: '[1/5] Authenticating...',
    step1Success: '      ✓ Login successful\n',
    step2Accessing: '[2/5] Accessing schedule system...',
    step2Success: '      ✓ Ready\n',
    step3Fetching: '[3/5] Fetching schedule data...',
    step3AutoDetected: '      Auto-detected semester: ',
    step3FoundCourses: '      ✓ Found ',
    step4Converting: '[4/5] Converting to ICS format...',
    step4Generated: '      ✓ Generated ',
    step5Sending: '[5/5] Sending email...',
    step5Success: '      ✓ Email sent\n',

    // Success/Error messages
    finalSuccess: 'Success! Check your email.',
    errorPrefix: '\n✗ Error: ',

    // Email sending
    emailSentSuccess: 'Email sent successfully to ',
    emailMessageId: 'Message ID: ',
    emailFailedWarning: '\n⚠️  Email sending failed: ',
    emailSavedLocally: '📁 ICS file saved to: ',
    emailImportManually: '   Import this file to your calendar manually.\n',

    // Errors
    noCourses: 'No courses found. Please check your semester selection.'
  },
  'zh-CN': {
    // CLI messages
    cliTitle: '\n@nbtca/nbtcal - 课程表导出工具',
    cliDivider: '========================================\n',
    promptStudentId: '学号：',
    promptPassword: '密码：',
    promptStartDate: '学期开始日期 (YYYY-MM-DD)：',
    promptEmail: '收件人邮箱地址（用于接收课程表）：',
    validationStudentIdRequired: '学号不能为空',
    validationPasswordRequired: '密码不能为空',
    validationInvalidDate: '日期格式无效（请使用 YYYY-MM-DD）',
    validationInvalidEmail: '邮箱格式无效',

    // Email mode messages
    usingCloudEmail: '📧 使用云端邮件服务（无需配置 SMTP）\n',
    smtpModeError: '\n❌ 错误：SMTP 模式需要设置 SMTP_USER 和 SMTP_PASS 环境变量。',
    smtpModeErrorHelp: '或切换到 API 模式：取消设置 EMAIL_MODE 或设为 EMAIL_MODE=api\n',
    smtpConfigInstructions: [
      '\n请设置以下环境变量：',
      '  SMTP_HOST="smtp.gmail.com"          # SMTP 服务器（可选，默认为 Gmail）',
      '  SMTP_PORT="587"                     # SMTP 端口（可选，默认为 587）',
      '  SMTP_SECURE="false"                 # 使用 SSL/TLS（可选，默认为 false）',
      '  SMTP_USER="your-email@example.com"  # 必需',
      '  SMTP_PASS="your-app-password"       # 必需\n'
    ],

    // Process steps
    step1Authenticating: '[1/5] 正在认证...',
    step1Success: '      ✓ 登录成功\n',
    step2Accessing: '[2/5] 正在访问课程系统...',
    step2Success: '      ✓ 就绪\n',
    step3Fetching: '[3/5] 正在获取课程数据...',
    step3AutoDetected: '      自动检测到学期：',
    step3FoundCourses: '      ✓ 找到 ',
    step4Converting: '[4/5] 正在转换为 ICS 格式...',
    step4Generated: '      ✓ 已生成 ',
    step5Sending: '[5/5] 正在发送邮件...',
    step5Success: '      ✓ 邮件已发送\n',

    // Success/Error messages
    finalSuccess: '成功！请查看您的邮箱。',
    errorPrefix: '\n✗ 错误：',

    // Email sending
    emailSentSuccess: '邮件发送成功至 ',
    emailMessageId: '消息 ID：',
    emailFailedWarning: '\n⚠️  邮件发送失败：',
    emailSavedLocally: '📁 ICS 文件已保存到：',
    emailImportManually: '   请手动将此文件导入到您的日历应用。\n',

    // Errors
    noCourses: '未找到课程。请检查您的学期选择。'
  }
};

/**
 * Get current language from environment or system
 * 从环境变量或系统获取当前语言
 */
export function getCurrentLanguage(): Language {
  // Check environment variable first
  const envLang = process.env.LANG || process.env.LANGUAGE || process.env.LC_ALL;

  if (envLang && envLang.toLowerCase().includes('zh')) {
    return 'zh-CN';
  }

  return 'en';
}

/**
 * Get translated message
 * 获取翻译后的消息
 */
export function t(key: keyof Messages, lang?: Language): string | string[] {
  const language = lang || getCurrentLanguage();
  return translations[language][key];
}

/**
 * Get all messages for a language
 * 获取某种语言的所有消息
 */
export function getMessages(lang?: Language): Messages {
  const language = lang || getCurrentLanguage();
  return translations[language];
}
