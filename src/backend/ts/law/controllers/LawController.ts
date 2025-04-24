import { IncomingMessage, ServerResponse } from 'http';
// import { LawService } from '../services/LawService';
import { LawModel } from '../models/LawModel';

export class LawController {
  // private service: LawService;
  private model: LawModel;

  constructor() {
    // this.service = new LawService();
    this.model = new LawModel();
  }

  async getAll(req: IncomingMessage, res: ServerResponse) {
    // const data = await this.service.getAllLaws();
    const data = await this.model.getAllLaws();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    // res.end(JSON.stringify({ success: true, data }));
    res.end(JSON.stringify(data)); // 그냥 간단하게 내보낸다...
  }

  async getByIds(req: IncomingMessage, res: ServerResponse, lawIds: string[] | null) {
    if (!lawIds) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: 'ID는 필수입니다.' }));
      return;
    }

    // const data = await this.service.getLawById(id);
    const data = await this.model.getLawByIds(lawIds);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  }
}
