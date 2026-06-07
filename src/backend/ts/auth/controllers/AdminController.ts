import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { MemberModel, MemberStatus, MemberPlan } from '../models/MemberModel';
import { AccessLogModel, AccessEvent } from '../models/AccessLogModel';
import { SettingModel } from '../models/SettingModel';

/** 관리자용 회원 관리. 모든 라우트는 adminGuard로 보호된다. */
export class AdminController {
  private model: MemberModel;
  private logModel: AccessLogModel;
  private settingModel: SettingModel;

  constructor() {
    this.model = new MemberModel();
    this.logModel = new AccessLogModel();
    this.settingModel = new SettingModel();
  }

  /** 전역 설정 조회. */
  getSettings = async (_req: Request, res: Response): Promise<void> => {
    try {
      res.json({ success: true, settings: await this.settingModel.getAll() });
    } catch (e) {
      console.error('getSettings 오류:', e);
      res.status(500).json({ success: false, error: '설정 조회 오류' });
    }
  };

  /** 전역 설정 수정. */
  updateSettings = async (req: Request, res: Response): Promise<void> => {
    try {
      const b = req.body || {};
      const patch: any = {};
      if (typeof b.banner_enabled === 'boolean') patch.banner_enabled = b.banner_enabled;
      if (typeof b.banner_text === 'string') patch.banner_text = b.banner_text;
      if (typeof b.banner_color === 'string') patch.banner_color = b.banner_color;
      if (Array.isArray(b.banner_pages)) patch.banner_pages = b.banner_pages.filter((x: any) => typeof x === 'string');
      if (typeof b.signup_enabled === 'boolean') patch.signup_enabled = b.signup_enabled;
      const settings = await this.settingModel.update(patch);
      res.json({ success: true, settings });
    } catch (e) {
      console.error('updateSettings 오류:', e);
      res.status(500).json({ success: false, error: '설정 수정 오류' });
    }
  };

  /** 승인 대기 회원 수 (뱃지용). */
  pendingCount = async (_req: Request, res: Response): Promise<void> => {
    try {
      res.json({ success: true, count: await this.model.countPending() });
    } catch (e) {
      console.error('pendingCount 오류:', e);
      res.status(500).json({ success: false, error: '조회 오류' });
    }
  };

  /** 로그인 실패 반복 경고. */
  failWarnings = async (_req: Request, res: Response): Promise<void> => {
    try {
      res.json({ success: true, rows: await this.logModel.failWarnings(3) });
    } catch (e) {
      console.error('failWarnings 오류:', e);
      res.status(500).json({ success: false, error: '실패 경고 조회 오류' });
    }
  };

  /** 통계: 일별 이벤트 + 가입 추이. */
  stats = async (req: Request, res: Response): Promise<void> => {
    try {
      const days = parseInt((req.query.days as string) || '30', 10);
      const [events, signups] = await Promise.all([
        this.logModel.dailyStats(days),
        this.model.dailySignups(days),
      ]);
      res.json({ success: true, events, signups });
    } catch (e) {
      console.error('stats 오류:', e);
      res.status(500).json({ success: false, error: '통계 조회 오류' });
    }
  };

  /** ID별 IP 접근 요약 ("어떤 ID가 어떤 IP로"). */
  ipSummary = async (_req: Request, res: Response): Promise<void> => {
    try {
      const rows = await this.logModel.ipSummaryByMember();
      res.json({ success: true, rows });
    } catch (e) {
      console.error('ipSummary 오류:', e);
      res.status(500).json({ success: false, error: 'IP 요약 조회 중 오류가 발생했습니다.' });
    }
  };

  /** 페이지 접근 일자별 집계. */
  visitsDaily = async (req: Request, res: Response): Promise<void> => {
    try {
      const days = parseInt((req.query.days as string) || '60', 10);
      const summary = await this.logModel.dailySummary(days);
      res.json({ success: true, summary });
    } catch (e) {
      console.error('visitsDaily 오류:', e);
      res.status(500).json({ success: false, error: '방문 집계 조회 중 오류가 발생했습니다.' });
    }
  };

  /** 특정 일자의 페이지 접근 상세. ?date=YYYY-MM-DD */
  visitsByDate = async (req: Request, res: Response): Promise<void> => {
    try {
      const date = (req.query.date as string || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.status(400).json({ success: false, error: '날짜 형식(YYYY-MM-DD)이 올바르지 않습니다.' });
        return;
      }
      const visits = await this.logModel.listByDate(date);
      res.json({ success: true, visits });
    } catch (e) {
      console.error('visitsByDate 오류:', e);
      res.status(500).json({ success: false, error: '방문 상세 조회 중 오류가 발생했습니다.' });
    }
  };

  /** 통합 활동 로그 조회. ?event=login|login_fail|app_enter|page_visit (없으면 전체). */
  listLogs = async (req: Request, res: Response): Promise<void> => {
    try {
      const event = (req.query.event as AccessEvent) || undefined;
      const limit = parseInt((req.query.limit as string) || '300', 10);
      const dateRe = /^\d{4}-\d{2}-\d{2}$/;
      const from = dateRe.test(req.query.from as string) ? (req.query.from as string) : undefined;
      const to = dateRe.test(req.query.to as string) ? (req.query.to as string) : undefined;
      const logs = await this.logModel.list(event, limit, from, to);
      res.json({ success: true, logs });
    } catch (e) {
      console.error('listLogs 오류:', e);
      res.status(500).json({ success: false, error: '활동 기록 조회 중 오류가 발생했습니다.' });
    }
  };

  /** 회원 목록. ?status=pending 등으로 필터. 비번 해시는 제외. */
  listMembers = async (req: Request, res: Response): Promise<void> => {
    try {
      const status = req.query.status as MemberStatus | undefined;
      const members = await this.model.listByStatus(status);
      const safe = members.map((m) => ({
        id: m.id,
        login_id: m.login_id,
        display_name: m.display_name,
        occupation: m.occupation,
        signup_source: m.signup_source,
        status: m.status,
        role: m.role,
        plan: m.plan,
        created_at: m.created_at,
        approved_at: m.approved_at,
        last_login_at: m.last_login_at,
      }));
      res.json({ success: true, members: safe });
    } catch (e) {
      console.error('listMembers 오류:', e);
      res.status(500).json({ success: false, error: '목록 조회 중 오류가 발생했습니다.' });
    }
  };

  /** 관리자가 회원의 표시 이름을 변경. */
  renameMember = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) {
        res.status(400).json({ success: false, error: '잘못된 회원 ID입니다.' });
        return;
      }
      const displayName = (req.body?.displayName ?? '').toString().trim();
      if (displayName.length < 1 || displayName.length > 50) {
        res.status(400).json({ success: false, error: '이름은 1~50자로 입력해 주세요.' });
        return;
      }
      const target = await this.model.findById(id);
      if (!target) {
        res.status(404).json({ success: false, error: '회원을 찾을 수 없습니다.' });
        return;
      }
      await this.model.updateDisplayName(id, displayName);
      res.json({ success: true, id, displayName });
    } catch (e) {
      console.error('renameMember 오류:', e);
      res.status(500).json({ success: false, error: '이름 변경 중 오류가 발생했습니다.' });
    }
  };

  /** 관리자가 회원 등급(plan)을 변경. free↔pro 수동 부여. */
  setPlan = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) {
        res.status(400).json({ success: false, error: '잘못된 회원 ID입니다.' });
        return;
      }
      const plan = (req.body?.plan ?? '').toString() as MemberPlan;
      if (!['free', 'pro'].includes(plan)) {
        res.status(400).json({ success: false, error: 'plan은 free/pro 중 하나여야 합니다.' });
        return;
      }
      const target = await this.model.findById(id);
      if (!target) {
        res.status(404).json({ success: false, error: '회원을 찾을 수 없습니다.' });
        return;
      }
      // 관리자 계정 등급은 강제 보호(삭제·정지와 동일). 항상 PRO 유지.
      if (target.role === 'admin') {
        res.status(400).json({ success: false, error: '관리자 계정의 등급은 변경할 수 없습니다.' });
        return;
      }
      await this.model.updatePlan(id, plan);
      res.json({ success: true, id, plan });
    } catch (e) {
      console.error('setPlan 오류:', e);
      res.status(500).json({ success: false, error: '등급 변경 중 오류가 발생했습니다.' });
    }
  };

  /** 관리자가 회원 비밀번호를 강제 변경(현재 비번 불필요). */
  resetPassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) {
        res.status(400).json({ success: false, error: '잘못된 회원 ID입니다.' });
        return;
      }
      const newPassword = (req.body?.newPassword ?? '').toString();
      if (!/^[a-zA-Z0-9]{6,30}$/.test(newPassword)) {
        res.status(400).json({ success: false, error: '새 비밀번호는 영문·숫자 6~30자로 입력해 주세요.' });
        return;
      }
      const target = await this.model.findById(id);
      if (!target) {
        res.status(404).json({ success: false, error: '회원을 찾을 수 없습니다.' });
        return;
      }
      if (target.signup_source === 'app') {
        res.status(400).json({ success: false, error: '앱 익명계정은 비밀번호가 없습니다.' });
        return;
      }
      const hash = await bcrypt.hash(newPassword, 10);
      await this.model.updatePassword(id, hash);
      res.json({ success: true, id });
    } catch (e) {
      console.error('resetPassword 오류:', e);
      res.status(500).json({ success: false, error: '비밀번호 변경 중 오류가 발생했습니다.' });
    }
  };

  /** 관리자가 회원을 완전 삭제. */
  deleteMember = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) {
        res.status(400).json({ success: false, error: '잘못된 회원 ID입니다.' });
        return;
      }
      const target = await this.model.findById(id);
      if (!target) {
        res.status(404).json({ success: false, error: '회원을 찾을 수 없습니다.' });
        return;
      }
      if (target.role === 'admin') {
        res.status(400).json({ success: false, error: '관리자 계정은 삭제할 수 없습니다.' });
        return;
      }
      await this.model.deleteMember(id);
      res.json({ success: true, id });
    } catch (e) {
      console.error('deleteMember 오류:', e);
      res.status(500).json({ success: false, error: '회원 삭제 중 오류가 발생했습니다.' });
    }
  };

  approve = async (req: Request, res: Response): Promise<void> => {
    await this.changeStatus(req, res, 'approved');
  };
  reject = async (req: Request, res: Response): Promise<void> => {
    await this.changeStatus(req, res, 'rejected');
  };
  revoke = async (req: Request, res: Response): Promise<void> => {
    await this.changeStatus(req, res, 'revoked');
  };

  private changeStatus = async (req: Request, res: Response, status: MemberStatus): Promise<void> => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) {
        res.status(400).json({ success: false, error: '잘못된 회원 ID입니다.' });
        return;
      }
      const target = await this.model.findById(id);
      if (!target) {
        res.status(404).json({ success: false, error: '회원을 찾을 수 없습니다.' });
        return;
      }
      // 관리자 자신을 거부/정지하는 실수 방지
      if (target.role === 'admin' && status !== 'approved') {
        res.status(400).json({ success: false, error: '관리자 계정은 변경할 수 없습니다.' });
        return;
      }
      await this.model.updateStatus(id, status, req.member?.id ?? null);
      res.json({ success: true, id, status });
    } catch (e) {
      console.error('changeStatus 오류:', e);
      res.status(500).json({ success: false, error: '상태 변경 중 오류가 발생했습니다.' });
    }
  };
}
