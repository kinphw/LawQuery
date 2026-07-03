import DbContext from '../../common/DbContext';

/**
 * 즐겨찾기(favorite) 통합 모델 — 로그인 회원별 조문 강조표시(북마크).
 *  - 해외법령(scope='foreign')·국내법(scope='law')을 한 테이블(ldb_auth.favorite)로 관리.
 *  - 논리키 (member_id, scope, law_code, node_key). 행 존재 = ON. 원본 DB는 불변.
 *    · foreign: node_key='<article_no>|<seg_index>'
 *    · law    : node_key=조문 셀 data-id('A2' 등)
 */
const AUTH_DB = process.env.AUTH_DB || 'ldb_auth';

export type FavoriteScope = 'foreign' | 'law';

export class FavoriteModel {
  private auth(): DbContext { return DbContext.getInstance(AUTH_DB); }

  /** 회원의 해당 (scope, law_code) 즐겨찾기 node_key 목록. */
  async getFavorites(memberId: number, scope: FavoriteScope, lawCode: string): Promise<string[]> {
    const rows = await this.auth().query<{ node_key: string }>(
      `SELECT node_key FROM favorite WHERE member_id = ? AND scope = ? AND law_code = ?`,
      [memberId, scope, lawCode]
    );
    return rows.map(r => r.node_key);
  }

  async addFavorite(memberId: number, scope: FavoriteScope, lawCode: string, nodeKey: string): Promise<void> {
    await this.auth().query(
      `INSERT IGNORE INTO favorite (member_id, scope, law_code, node_key) VALUES (?, ?, ?, ?)`,
      [memberId, scope, lawCode, nodeKey]
    );
  }

  async removeFavorite(memberId: number, scope: FavoriteScope, lawCode: string, nodeKey: string): Promise<void> {
    await this.auth().query(
      `DELETE FROM favorite WHERE member_id = ? AND scope = ? AND law_code = ? AND node_key = ?`,
      [memberId, scope, lawCode, nodeKey]
    );
  }
}
