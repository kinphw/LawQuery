import { IncomingMessage, ServerResponse } from 'http';
import { lawHandler } from './lawHandler';
// import { interpretationHandler } from './interpretationHandler';

export async function apiHandler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname.startsWith('/api/law')) {
    return lawHandler(req, res, url);
  }
  if (pathname.startsWith('/api/interpretation')) {
    // return interpretationHandler(req, res, url);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 - Not Found');
}