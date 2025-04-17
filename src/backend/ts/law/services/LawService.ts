// 폐기. 당장은 서비스 레이어가 필요하지 않지만, 나중에 추가할 수 있습니다.

import { LawModel } from '../models/LawModel';

export class LawService {
  private model: LawModel;

  constructor() {
    this.model = new LawModel();
  }

  async getAllLaws() {
    return await this.model.getAllLaws();
  }

  async getLawById(id: string) {
    return await this.model.getLawById(id);
  }
}
