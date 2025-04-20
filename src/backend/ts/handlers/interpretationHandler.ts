import { IncomingMessage, ServerResponse } from 'http';
import { InterpretationController } from '../interpretation/controllers/InterpretationController';
import { URL } from 'url';

const controller = new InterpretationController();

export async function interpretationHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const pathname = url.pathname;
    
    // GET /api/interpretation/search - 검색 API
    if (pathname === '/api/interpretation/search' && req.method === 'GET') {
      await controller.search(req, res);
      return;
    }
    
    // GET /api/interpretation/initial - 초기 데이터 API
    if (pathname === '/api/interpretation/initial' && req.method === 'GET') {
      await controller.getInitialData(req, res);
      return;
    }
    
    // GET /api/interpretation/detail/:id - 상세정보 API
    const detailMatch = pathname.match(/^\/api\/interpretation\/detail\/(\d+)$/);
    if (detailMatch && req.method === 'GET') {
      const id = detailMatch[1];
      await controller.getDetail(req, res, id);
      return;
    }
    
    // 경로를 찾을 수 없음
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      success: false,
      error: '요청한 API를 찾을 수 없습니다.'
    }));
    
  } catch (error) {
    console.error('Interpretation handler error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }));
  }
}