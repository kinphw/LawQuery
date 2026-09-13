import DbContext from '../../common/DbContext';
import { LawBaseModel } from './LawBaseModel';

/** 연혁비교 버전 1행(db_hist_version). ver_ref = 'MST@시행일자'(법·시행령) | 행정규칙일련번호. */
export interface HistVersion {
  origin: string;
  track: string | null;
  ver_ref: string;
  ef_date: string;
  prom_date: string | null;
  prom_no: string | null;
  rev_kind: string | null;
  status: string | null;
  name: string | null;
  kind_name: string | null;
  article_count: number;
}

export interface HistArticle {
  seq: number;
  art_key: string;
  title: string | null;
  content: string;
}

/**
 * 연혁비교 아카이브(db_hist_*) 조회. 적재는 LawQuery-law 의 pipeline/history.py 가 한다.
 * 테이블이 없는 DB(연혁 미적재·오프라인판)는 빈 배열 → 프론트가 '연혁 데이터 없음'을 띄운다.
 */
export class LawHistoryModel extends LawBaseModel {

  private static trackOf(track?: string): string | null {
    return track && /^[a-z0-9_]+$/.test(track) ? track : null;
  }

  async getVersions(dbContext: DbContext, track?: string): Promise<HistVersion[]> {
    this.setDbContext(dbContext);
    const tk = LawHistoryModel.trackOf(track);
    try {
      return await this.db.query<HistVersion>(
        `SELECT origin, track, ver_ref, ef_date, prom_date, prom_no, rev_kind, status, name, kind_name, article_count
           FROM db_hist_version
          ${tk ? 'WHERE track IS NULL OR track = ?' : ''}
          ORDER BY origin, ef_date, prom_date, _pk`, tk ? [tk] : []);
    } catch {
      return [];
    }
  }

  async getMeta(dbContext: DbContext, track?: string): Promise<{ origin: string; full_name: string; short_name: string }[]> {
    this.setDbContext(dbContext);
    const tk = LawHistoryModel.trackOf(track);
    return await this.db.query(
      `SELECT origin, full_name, short_name FROM db_meta ${tk ? 'WHERE track IS NULL OR track = ?' : ''} ORDER BY _pk`,
      tk ? [tk] : []);
  }

  /** 한 버전의 조 목록(순서대로). */
  async getArticles(dbContext: DbContext, origin: string, verRef: string, track?: string): Promise<HistArticle[]> {
    this.setDbContext(dbContext);
    const tk = LawHistoryModel.trackOf(track);
    return await this.db.query<HistArticle>(
      `SELECT a.seq, a.art_key, a.title, t.content
         FROM db_hist_article a
         JOIN db_hist_text t ON t.text_hash = a.text_hash
        WHERE a.origin = ? AND a.ver_ref = ? ${tk ? 'AND (a.track IS NULL OR a.track = ?)' : ''}
        ORDER BY a.seq`, tk ? [origin, verRef, tk] : [origin, verRef]);
  }
}
