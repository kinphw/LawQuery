import { Request, Response } from 'express';
import { MemberModel, MemberStatus } from '../models/MemberModel';
import { AccessLogModel } from '../models/AccessLogModel';

/** 관리자용 회원 관리. 모든 라우트는 adminGuard로 보호된다. */
export class AdminController {
  private model: MemberModel;
  private logModel: AccessLogModel;

  constructor() {
    this.model = new MemberModel();
    this.logModel = new AccessLogModel();
  }

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
