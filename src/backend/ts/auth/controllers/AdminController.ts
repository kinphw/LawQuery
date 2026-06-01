import { Request, Response } from 'express';
import { MemberModel, MemberStatus } from '../models/MemberModel';
import { AccessLogModel } from '../models/AccessLogModel';
import { PageVisitModel } from '../models/PageVisitModel';

/** 관리자용 회원 관리. 모든 라우트는 adminGuard로 보호된다. */
export class AdminController {
  private model: MemberModel;
  private logModel: AccessLogModel;
  private visitModel: PageVisitModel;

  constructor() {
    this.model = new MemberModel();
    this.logModel = new AccessLogModel();
    this.visitModel = new PageVisitModel();
  }

  /** 페이지 접근 일자별 집계. */
  visitsDaily = async (req: Request, res: Response): Promise<void> => {
    try {
      const days = parseInt((req.query.days as string) || '60', 10);
      const summary = await this.visitModel.dailySummary(days);
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
      const visits = await this.visitModel.listByDate(date);
      res.json({ success: true, visits });
    } catch (e) {
      console.error('visitsByDate 오류:', e);
      res.status(500).json({ success: false, error: '방문 상세 조회 중 오류가 발생했습니다.' });
    }
  };

  /** 접속(로그인/앱진입) 기록 조회. */
  listLogs = async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = parseInt((req.query.limit as string) || '200', 10);
      const logs = await this.logModel.list(limit);
      res.json({ success: true, logs });
    } catch (e) {
      console.error('listLogs 오류:', e);
      res.status(500).json({ success: false, error: '접속 기록 조회 중 오류가 발생했습니다.' });
    }
  };

  /** 회원 목록. ?status=pending 등으로 필터. 비번 해시는 제외. */
  listMembers = async (req: Request, res: Response): Promise<void> => {
    try {
      const status = req.query.status as MemberStatus | undefined;
      const members = await this.model.listByStatus(status);
      const safe = members.map((m) => ({
        id: m.id,
        email: m.email,
        display_name: m.display_name,
        signup_source: m.signup_source,
        status: m.status,
        role: m.role,
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
