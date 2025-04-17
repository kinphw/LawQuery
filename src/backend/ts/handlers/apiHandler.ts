import { IncomingMessage, ServerResponse } from 'http';
import { LawController } from '../law/controllers/LawController';

const lawController = new LawController();

export async function apiHandler(req: IncomingMessage, res: ServerResponse) {
  const baseURL = `http://${req.headers.host}`;
  const url = new URL(req.url || '', baseURL);
  const pathname = url.pathname;
  const method = req.method || 'GET';

  if (pathname === '/api/law/all' && method === 'GET') {
    return await lawController.getAll(req, res);
  }

  if (pathname === '/api/law/get' && method === 'GET') {
    const id = url.searchParams.get('id');
    return await lawController.getById(req, res, id);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 - Not Found');
}
