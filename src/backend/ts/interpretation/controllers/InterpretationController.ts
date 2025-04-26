import { Request, Response } from 'express';
import { InterpretationModel } from '../models/InterpretationModel';
// import { URL } from 'url';

export class InterpretationController {
  private model: InterpretationModel;

  constructor() {
    this.model = new InterpretationModel();
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

  // async getDetail(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
    async getDetail(req: Request, res: Response): Promise<void> {  
    try {
      // req.params에서 id 추출
      const id = req.params.id;
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

  // async getInitialData(req: IncomingMessage, res: ServerResponse): Promise<void> {
    async getInitialData(req: Request, res: Response): Promise<void> {  
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