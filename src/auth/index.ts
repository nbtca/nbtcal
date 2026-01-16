import axios, { AxiosInstance } from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import * as cheerio from 'cheerio';
import CryptoJS from 'crypto-js';
import type { Credentials } from '../types.js';

function randomString(length: number): string {
  const chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function encryptPassword(password: string, key: string): string {
  const randomStr = randomString(64);
  const data = randomStr + password;
  const iv = randomString(16);
  const encrypted = CryptoJS.AES.encrypt(
    data,
    CryptoJS.enc.Utf8.parse(key),
    { iv: CryptoJS.enc.Utf8.parse(iv), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
  );
  return encrypted.toString();
}

export class AuthService {
  private client: AxiosInstance;
  private cookieJar: CookieJar;

  constructor(private credentials: Credentials) {
    this.cookieJar = new CookieJar();
    this.client = wrapper(axios.create({
      jar: this.cookieJar,
      withCredentials: true,
      maxRedirects: 10,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    }));
  }

  async login(): Promise<void> {
    if (!this.credentials.username || !this.credentials.password) {
      throw new Error('Username and password are required');
    }

    try {
      // Get login page
      const loginPageResponse = await this.client.get('https://webvpn.nbt.edu.cn/');

      if (loginPageResponse.status !== 200) {
        throw new Error(`Failed to access WebVPN login page (Status: ${loginPageResponse.status}). Please check your network connection.`);
      }

      const $ = cheerio.load(loginPageResponse.data);
      const form = $('#pwdFromId');

      // Extract form data
      const execution = form.find('input[name="execution"]').val() as string;
      const pwdEncryptSalt = form.find('#pwdEncryptSalt').val() as string;

      if (!pwdEncryptSalt) {
        throw new Error('Failed to extract encryption salt from login page. The page structure may have changed.');
      }

    // Encrypt password
    const encryptedPassword = encryptPassword(this.credentials.password, pwdEncryptSalt);

      // Submit login
      const actualUrl = loginPageResponse.request?.res?.responseUrl || 'https://webvpn.nbt.edu.cn/';
      const submitUrl = new URL('/authserver/login', actualUrl).href;

      const loginResponse = await this.client.post(submitUrl, new URLSearchParams({
        username: this.credentials.username,
        password: encryptedPassword,
        _eventId: 'submit',
        cllt: 'userNameLogin',
        dllt: 'generalLogin',
        execution
      }).toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': actualUrl
        }
      });

      // Check if login was successful by looking for error messages
      const loginHtml = cheerio.load(loginResponse.data);
      const errorMsg = loginHtml('#errorMsg, .alert-danger').text().trim();

      if (errorMsg) {
        throw new Error(`Login failed: ${errorMsg}. Please check your credentials.`);
      }

    } catch (error: any) {
      if (error.message.includes('Login failed') || error.message.includes('Failed to')) {
        throw error;
      }
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        throw new Error('Cannot connect to NBT WebVPN. Please check your network connection.');
      }
      throw new Error(`Authentication error: ${error.message}`);
    }
  }

  async navigateToSchedule(): Promise<void> {
    try {
      // Enter educational system
      await this.client.get('https://jwxt-443.webvpn.nbt.edu.cn/sso/jziotlogin');
      await this.client.get('https://jwxt-443.webvpn.nbt.edu.cn/jwglxt/xtgl/index_initMenu.html');

      // Access schedule page to initialize session
      const schedulePageResponse = await this.client.get(
        'https://jwxt-443.webvpn.nbt.edu.cn/jwglxt/kbcx/xskbcx_cxXskbcxIndex.html?gnmkdm=N2151&layout=default'
      );

      if (schedulePageResponse.status !== 200) {
        throw new Error('Failed to access schedule page. You may not have permission.');
      }
    } catch (error: any) {
      if (error.message.includes('Failed to')) {
        throw error;
      }
      throw new Error(`Failed to navigate to schedule system: ${error.message}`);
    }
  }

  getClient(): AxiosInstance {
    return this.client;
  }
}
