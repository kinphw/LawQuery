import DbContext from '../../common/DbContext';

export interface AppSettings {
  banner_enabled: boolean;
  banner_text: string;
  banner_color: string;   // bootstrap 색상: info/warning/danger/success/secondary
  signup_enabled: boolean;
}

const DEFAULTS: AppSettings = {
  banner_enabled: false,
  banner_text: '',
  banner_color: 'info',
  signup_enabled: true,
};

/** 전역 앱 설정(키-값). 배너/가입허용 등. */
export class SettingModel {
  private db;

  constructor() {
    this.db = DbContext.getInstance(process.env.AUTH_DB || 'ldb_auth');
  }

  async getAll(): Promise<AppSettings> {
    const rows = await this.db.query<{ k: string; v: string | null }>('SELECT k, v FROM app_setting');
    const map: Record<string, string | null> = {};
    rows.forEach((r) => { map[r.k] = r.v; });
    return {
      banner_enabled: map.banner_enabled === '1',
      banner_text: map.banner_text ?? '',
      banner_color: map.banner_color || 'info',
      signup_enabled: map.signup_enabled !== '0', // 기본 허용
    };
  }

  /** 공개용: 배너 정보만 (가입허용 등 내부 설정은 노출 안 함). */
  async getPublicBanner(): Promise<{ enabled: boolean; text: string; color: string }> {
    const s = await this.getAll();
    return { enabled: s.banner_enabled, text: s.banner_text, color: s.banner_color };
  }

  async isSignupEnabled(): Promise<boolean> {
    const s = await this.getAll();
    return s.signup_enabled;
  }

  private async set(key: string, value: string): Promise<void> {
    await this.db.query(
      'INSERT INTO app_setting (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)',
      [key, value]
    );
  }

  async update(s: Partial<AppSettings>): Promise<AppSettings> {
    if (s.banner_enabled !== undefined) await this.set('banner_enabled', s.banner_enabled ? '1' : '0');
    if (s.banner_text !== undefined) await this.set('banner_text', s.banner_text.slice(0, 1000));
    if (s.banner_color !== undefined) {
      const allowed = ['info', 'warning', 'danger', 'success', 'secondary', 'primary'];
      await this.set('banner_color', allowed.includes(s.banner_color) ? s.banner_color : 'info');
    }
    if (s.signup_enabled !== undefined) await this.set('signup_enabled', s.signup_enabled ? '1' : '0');
    return this.getAll();
  }
}

export { DEFAULTS };
