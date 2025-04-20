import { IncomingMessage, ServerResponse } from 'http';
import { InterpretationModel } from '../models/InterpretationModel';
import { URL } from 'url';

export class InterpretationController {
  private model: InterpretationModel;

  constructor() {
    this.model = new InterpretationModel();
  }

  async search(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      // URL에서 쿼리 파라미터 추출
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const type = url.searchParams.get('type') || '전체';
      const serial = url.searchParams.get('serial') || '';
      const field = url.searchParams.get('field') || '전체';
      const keyword = url.searchParams.get('keyword') || '';

      const results = await this.model.search({ type, serial, field, keyword });
      
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        count: results.length,
        data: results
      }));
    } catch (error) {
      console.error('Search error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ 
        success: false, 
        error: '서버 오류가 발생했습니다.' 
      }));
    }
  }

  async getDetail(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
    try {
      const numId = parseInt(id, 10);
      
      if (isNaN(numId)) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ 
          success: false, 
          error: '올바른 ID 형식이 아닙니다.' 
        }));
        return;
      }

      const detail = await this.model.getDetail(numId);
      
      if (!detail) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ 
          success: false, 
          error: '해당 ID의 데이터를 찾을 수 없습니다.' 
        }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ 
        success: true, 
        data: detail 
      }));
    } catch (error) {
      console.error('Get detail error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ 
        success: false, 
        error: '서버 오류가 발생했습니다.' 
      }));
    }
  }

  async getInitialData(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const results = await this.model.getInitialData();
      
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        count: results.length,
        data: results
      }));
    } catch (error) {
      console.error('Initial data error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ 
        success: false, 
        error: '서버 오류가 발생했습니다.' 
      }));
    }
  }
}