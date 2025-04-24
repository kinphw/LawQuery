import { IncomingMessage, ServerResponse } from 'http';
import { LawController } from '../law/controllers/LawController';

const lawController = new LawController();

export async function lawHandler(req: IncomingMessage, res: ServerResponse, url: URL) {
  const method = req.method || 'GET';
  const pathname = url.pathname;

  if (pathname === '/api/law/all' && method === 'GET') {
    return await lawController.getAll(req, res);
  }
  if (pathname === '/api/law/get' && method === 'GET') {
    // const id = url.searchParams.get('id');
    const lawIds = url.searchParams.getAll('id'); // url객체로부터 여러 id 파라미터 모두 가져오기    
    return await lawController.getByIds(req, res, lawIds);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 - Not Found');
}