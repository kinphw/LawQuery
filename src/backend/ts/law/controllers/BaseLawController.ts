import { LawBaseModel } from '../models/LawBaseModel';
import DbContext, { DbContextType } from '../../common/DbContext';

// 제네릭 추가
export abstract class BaseLawController<T extends LawBaseModel = LawBaseModel> {
  protected model: T;
  
  constructor(model: T) {
    this.model = model;
  }

  // 유효한 law 코드 형식: 소문자·숫자 1~10자만(ldb_<code> DB명 구성용).
  // ⚠️ 보안: law 는 클라이언트 입력이다. 화이트리스트 없이 `ldb_${law}` 로 스키마명을 만들면
  //   임의 스키마 지정 + 요청마다 유니크 값으로 풀을 무한 생성(메모리 DoS)할 수 있다.
  //   여기서 형식을 강제하고(특수문자·경로·대문자·과다길이 차단), DbContext.getInstance 가
  //   인스턴스 수 상한으로 2차 방어한다.
  private static readonly LAW_RE = /^[a-z0-9]{1,10}$/;
  // 민감 스키마 보호: law=auth 로 ldb_auth(회원·비밀번호 해시)를 가리키지 못하게 한다.
  private static readonly RESERVED_LAW = new Set(['auth']);

  // DbContext를 동적으로 설정하는 메서드
  protected getDbContext(law: string): DbContext {
    if (!BaseLawController.LAW_RE.test(law) || BaseLawController.RESERVED_LAW.has(law)) {
      throw new Error(`유효하지 않은 law 파라미터: ${String(law).slice(0, 20)}`);
    }
    const dbContext: DbContextType = DbContext.getInstance(`ldb_${law}`);
    return dbContext;
  }
}