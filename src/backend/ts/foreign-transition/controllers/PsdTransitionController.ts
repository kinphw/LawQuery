import { Request, Response } from 'express';
import {
  ChangeType,
  DEFAULT_TRANSITION_VERSION,
  PsdLawCode,
  PsdTransitionModel,
  PSD_LAW_CODES,
} from '../models/PsdTransitionModel';

const CHANGE_TYPES: ChangeType[] = ['maintained', 'clarified', 'strengthened', 'relaxed', 'material_change', 'pending'];

export class PsdTransitionController {
  private model = new PsdTransitionModel();

  catalog = async (req: Request, res: Response): Promise<void> => {
    try {
      const version = String(req.query.version || DEFAULT_TRANSITION_VERSION).trim();
      const data = await this.model.getCatalog(version);
      if (!data) {
        res.status(404).json({ success: false, error: '이행분석 버전을 찾을 수 없습니다.' });
        return;
      }
      res.json({ success: true, data: { ...data, unlocked: req.member?.plan === 'pro' } });
    } catch (error) {
      console.error('[foreign-transition] catalog', error);
      res.status(500).json({ success: false, error: '이행분석 목록 조회 실패' });
    }
  };

  view = async (req: Request, res: Response): Promise<void> => {
    const code = String(req.query.code || '').trim() as PsdLawCode;
    if (!PSD_LAW_CODES.includes(code)) {
      res.status(400).json({ success: false, error: 'PSD2·EMD2·PSD3·PSR만 지원합니다.' });
      return;
    }
    try {
      const version = String(req.query.version || DEFAULT_TRANSITION_VERSION).trim();
      const data = await this.model.getAnalysis(code, version);
      if (!data) {
        res.status(404).json({ success: false, error: '이행분석 버전을 찾을 수 없습니다.' });
        return;
      }
      res.json({ success: true, data: { ...data, editable: req.member?.role === 'admin' } });
    } catch (error) {
      console.error('[foreign-transition] view', error);
      res.status(500).json({ success: false, error: '이행분석 조회 실패' });
    }
  };

  updateAssessment = async (req: Request, res: Response): Promise<void> => {
    const code = String(req.body?.code || '').trim() as PsdLawCode;
    const articleNo = String(req.body?.articleNo || '').trim();
    const changeType = String(req.body?.changeType || '') as ChangeType;
    const summaryKo = String(req.body?.summaryKo || '').trim();
    const detailKo = String(req.body?.detailKo || '').trim();
    const version = String(req.body?.version || DEFAULT_TRANSITION_VERSION).trim();
    if (!PSD_LAW_CODES.includes(code) || !/^\d+$/.test(articleNo) || !CHANGE_TYPES.includes(changeType) || !summaryKo) {
      res.status(400).json({ success: false, error: '법령·조문·변경유형·요약을 확인해 주세요.' });
      return;
    }
    if (summaryKo.length > 4000 || detailKo.length > 20000) {
      res.status(400).json({ success: false, error: '분석 문안이 너무 깁니다.' });
      return;
    }
    try {
      const updated = await this.model.updateAssessment(
        code, articleNo, changeType, summaryKo, detailKo, req.member!.id, version,
      );
      if (!updated) {
        res.status(404).json({ success: false, error: '수정할 조문 분석을 찾지 못했습니다.' });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      console.error('[foreign-transition] updateAssessment', error);
      res.status(500).json({ success: false, error: '이행분석 저장 실패' });
    }
  };
}
