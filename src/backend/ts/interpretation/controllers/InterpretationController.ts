import { Request, Response } from 'express';
import { InterpretationModel } from '../models/InterpretationModel';
import type { SearchResult } from '../types/SearchResult';
import { isPro } from '../../auth/middleware/authGuard';
// import { URL } from 'url';

// 비회원 유권해석 티저 분량: 초기목록 10건 / 검색결과 3건
const TEASER_INITIAL = 10;
const TEASER_SEARCH = 3;

export class InterpretationController {
  private model: InterpretationModel;

  constructor() {
    this.model = new InterpretationModel();
  }

  /**
   * 비회원 티저: 상위 max건만 남기고, 그 행들의 본문(질의요지/회답/이유)을 인라인으로 합쳐 반환.
   * → 보이는 행만 본문을 받으므로 임의 id 열람(전체 스크래핑)이 불가능하다(상세 엔드포인트는 차단 유지).
   */
  private async teaserRows(rows: SearchResult[], max: number): Promise<SearchResult[]> {
    const sliced = rows.slice(0, max);
    const details = await this.model.getDetailsByIds(sliced.map((r) => r.id));
    const byId = new Map(details.map((d) => [d.id, d]));
    return sliced.map((r) => {
      const d = byId.get(r.id);
      return d ? { ...r, 질의요지: d.질의요지, 회답: d.회답, 이유: d.이유 } : r;
    });
  }

  // async search(req: IncomingMessage, res: ServerResponse): Promise<void> {
    async search(req: Request, res: Response): Promise<void> {  
    try {
      // // URL에서 쿼리 파라미터 추출
      // const url = new URL(req.url || '', `http://${req.headers.host}`);
      // const type = url.searchParams.get('type') || '전체';
      // const serial = url.searchParams.get('serial') || '';
      // const field = url.searchParams.get('field') || '전체';
      // const keyword = url.searchParams.get('keyword') || '';

      // req.query에서 파라미터 추출
      const type = req.query.type as string || '전체';
      const serial = req.query.serial as string || '';
      const field = req.query.field as string || '전체';
      const keyword = req.query.keyword as string || '';
      const startDate = req.query.startDate as string || undefined;
      const endDate = req.query.endDate as string || undefined;


      const results = await this.model.search({ type, serial, field, keyword, startDate, endDate });

      // 비회원: 검색결과 상위 3건 + 그 본문만(나머지 미전송). total=전체 매칭 수.
      if (!isPro(req.member?.plan)) {
        const data = await this.teaserRows(results, TEASER_SEARCH);
        res.status(200).json({ success: true, count: data.length, data, locked: true, total: results.length });
        return;
      }

      res.status(200).json({
          success: true,
          count: results.length,
          data: results
      })
    } catch (error) {
      console.error('Search error:', error);
      // res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      // res.end(JSON.stringify({ 
      //   success: false, 
      //   error: '서버 오류가 발생했습니다.' 
      // }));
      res.status(500).json({
        success: false, error: '서버 오류가 발생했습니다.' 
      });
    }
  }

  // async getDetail(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
    async getDetail(req: Request, res: Response): Promise<void> {  
    try {
      // req.params에서 id 추출
      const id = req.params.id;
      const numId = parseInt(id, 10);
      
      if (isNaN(numId)) {
        // res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        // res.end(JSON.stringify({ 
        //   success: false, 
        //   error: '올바른 ID 형식이 아닙니다.' 
        // }));

        res.status(400).json({
          success: false, error: '올바른 ID 형식이 아닙니다.'
        });
        
        return;
      }

      const detail = await this.model.getDetail(numId);
      
      if (!detail) {
        // res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        // res.end(JSON.stringify({ 
        //   success: false, 
        //   error: '해당 ID의 데이터를 찾을 수 없습니다.' 
        // }));

        res.status(404).json({
          success:false, error: '해당 ID의 데이터를 찾을 수 없습니다.'
        });

        return;
      }

      // res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      // res.end(JSON.stringify({ 
      //   success: true, 
      //   data: detail 
      // }));

      res.status(200).json({          
        success: true, 
        data: detail 
      });

    } catch (error) {
      console.error('Get detail error:', error);
      // res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      // res.end(JSON.stringify({ 
      //   success: false, 
      //   error: '서버 오류가 발생했습니다.' 
      // }));
      res.status(500).json({          
        success: false, error: '서버 오류가 발생했습니다.' 
      });
    }
  }

  // async getInitialData(req: IncomingMessage, res: ServerResponse): Promise<void> {
    async getInitialData(req: Request, res: Response): Promise<void> {
    try {
      const results = await this.model.getInitialData();

      // 비회원: 상위 10건 + 그 본문만(나머지 미전송). 상세 엔드포인트는 차단 유지.
      if (!isPro(req.member?.plan)) {
        const data = await this.teaserRows(results, TEASER_INITIAL);
        res.status(200).json({
          success: true,
          count: data.length,
          data,
          locked: true,
          total: results.length,
        });
        return;
      }

      res.status(200).json({
        success: true,
        count: results.length,
        data: results
      });

    } catch (error) {
      console.error('Initial data error:', error);
      // res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      // res.end(JSON.stringify({ 
      //   success: false, 
      //   error: '서버 오류가 발생했습니다.' 
      // }));

      res.status(500).json({
        success: false, error: '서버 오류가 발생했습니다.' 
      });

    }
  }
}