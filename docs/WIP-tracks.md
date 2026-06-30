# 행정규칙 멀티트랙 (단일 코드 + 트랙 토글)

> **상태: dev 구현 완료(2026-06-30, 미커밋).** ldb_z 2트랙 적재 + 백엔드 트랙필터 + 프론트 토글.
> 검증: /api/law/list tracks 노출, 트랙필터 재귀쿼리 격리(fi 604/0, sd 0/113), getMeta 트랙별 5행,
> 백·프론트 typecheck 통과, 단일트랙(j) 회귀 무. 남은 것: 브라우저 PRO 시각검증 + 운영배포.


자본시장법(`ldb_z`)처럼 **시행령 아래 행정규칙이 2개 이상 병렬**인 경우를 단일 법령코드로 담고,
UX 토글로 4·5열(감독규정/세칙)만 바꿔 보이게 한다. 첫 케이스:

| 트랙 | 감독규정(r) | 세칙(b) |
|---|---|---|
| `fi` 금융투자업 | 금융투자업규정 `2100000278346` | 금융투자업규정시행세칙 `2200000108691` |
| `sd` 증권발행·공시 | 증권의 발행 및 공시 등에 관한 규정 `2100000274042` | 〃 시행세칙 `2200000107389` |

법(a)/시행령(e)/시행규칙(s)은 **양 트랙 공유**. 트랙은 r·b 두 열에만 영향.

> 일반화: 트랙은 N개 가능. 단일트랙 법령(j·y·s·g·c·t·기존 z)은 이 기능과 **무관·무영향**.

---

## 핵심 설계 결정

### D1. 트랙 구분 = "네임스페이스 ID" + `rdb.track` (블라스트 최소)
두 트랙의 규정/세칙은 둘 다 `제1-1조`라 **ID가 충돌**한다(`R1-1` vs `R1-1`). 두 갈래를 비교:

- ❌ 자연 ID + 6개 테이블에 track 컬럼(rdb·db_rdb_hl·db_annex·db_ref·db_r·db_b): 충돌을 컬럼으로 구분 → 광범위.
- ✅ **트랙별 네임스페이스 ID** + **`rdb.track` 1개**: 멀티트랙 법령은 각 트랙 r·b ID에 트랙코드를 박아 **전역 유일**하게 만든다.
  - ID 규약: `R{track}.{번호}` (예: `Rfi.1-1`, `Rsd.1-1`, 가지 `Rfi.1-2_2`). 구분자 `.`는 기존 ID에서 미사용 → 안전.
    - `levelOf`(첫 글자 R/B) ✓, 재귀쿼리 `LIKE 'R%'` ✓, 프론트 `joInfo`(`^[AESR]\d+`)는 `Rfi.`에 안 걸려 라벨='' (조-단위라 무해) ✓.
  - **distinct ID 덕분에 db_annex·db_ref·db_rdb_hl·db_r·db_b는 스키마 무변경.** 각 트랙 노드가 자기 트리에서만 참조되므로 그대로 동작.
  - 재귀 트래버설만 트랙 제한이 필요 → **`rdb.track`** 컬럼(공유 a/e/s 엣지=NULL, 트랙 r/b 엣지=트랙코드).

### D2. 기존 법령 무영향 = "멀티트랙 법령만" 트랙 인지
- `rdb.track`은 **멀티트랙 법령(z)만** 갖는다(재적재로 추가). 기존 단일트랙 ldb_*는 손 안 댐.
- 백엔드는 레지스트리에서 `tracks>1`인 법령에만 **트랙 필터 쿼리** 경로를 탄다. 단일트랙은 현재 쿼리 그대로.

### D3. 트랙 메타 = `db_track` 테이블 + `db_meta.track`
- `db_track(track_code, label, sort_order)` — 토글 버튼 목록. 예: `(fi,'금융투자업',1) (sd,'증권발행·공시',2)`.
- `db_meta`에 `track` 컬럼 추가(a/e/s=NULL, 트랙별 r/b 행 2벌) → 열 헤더가 트랙 따라 `금융투자업규정`/`증권의 발행…규정`으로 바뀜.

---

## 변경 범위

### 1) 파이프라인 (LawQuery-law) — job.json `tracks`
```jsonc
{
  "code": "z",
  "sources": { "a": {...}, "e": {...}, "s": {...} },   // 공유단
  "tracks": {
    "fi": { "label": "금융투자업",
            "r": {"kind":"admrul","id":"2100000278346","short":"금융투자업규정","parent":"e","refers":["「…시행령」","영"]},
            "b": {"kind":"admrul","id":"2200000108691","short":"금융투자업규정시행세칙","parent":"r","refers":["「금융투자업규정」","규정"]} },
    "sd": { "label": "증권발행·공시",
            "r": {"kind":"admrul","id":"2100000274042","short":"증권의 발행 및 공시 등에 관한 규정","parent":"e","refers":["「…시행령」","영"]},
            "b": {"kind":"admrul","id":"2200000107389","short":"증권의 발행 및 공시 등에 관한 규정 시행세칙","parent":"r","refers":["「증권의 발행 및 공시 등에 관한 규정」","규정"]} }
  }
}
```
- `build`: `sources` 처리 후 `tracks`의 각 트랙 r·b fetch → **ID에 트랙코드 네임스페이스**(`stem_id`에 track 인자) + meta에 track 태그.
- `rdb`: 트랙별 b→r·r→e 엣지 생성 시 `track` 필드 부여(공유 a/e/s 엣지=track 없음). 인용 해석도 트랙 prefix로.
- `annex`/`ref`: 트랙 노드 distinct ID라 그대로(트랙 prefix만 반영).
- `loader`/schema: `rdb.track`, `db_meta.track`, `db_track` 적재. 단일트랙(`sources`만)이면 전부 미부여 → 기존과 동일.
- **하위호환**: `tracks` 없으면 현행 그대로.

### 2) 백엔드 (LawQuery `src/backend`)
- `LawModel.getAllLaws/getLawByIds/getPivot(step, track?)`: 멀티트랙이면 재귀 CTE의 rdb JOIN에 `AND (rdb.track IS NULL OR rdb.track = ?)` 추가. 단일트랙이면 현 쿼리.
- `getLawRegistry`/`/api/law/list`: 법령별 `tracks: [{code,label,r_short,b_short}]` 포함(db_track+db_meta.track).
- 티저(상위 3개 법조문)·annex/ref/penalty 엔드포인트: **변경 거의 없음**(법조문 기준·distinct ID).

### 3) 프론트 (LawQuery `src/frontend`)
- `LawController.bootstrap`: 법령이 멀티트랙이면 **세그먼트 토글** 렌더(예: `[금융투자업] [증권발행·공시]`). 단일트랙이면 미표시.
- `?track=` URL 파라미터(기본=첫 트랙). `ApiUrlBuilder`가 모든 fetch에 자동 첨부(law·step과 동일 패턴).
- 토글 클릭 → `track` 교체 → `/all`+서브목록(annexIds/referenceIds/penaltyIds) 재fetch → 재렌더. 1·2·3열 동일, 4·5열만 스왑.
- `LawTable` 헤더 4·5열 = 활성 트랙의 `r_short`/`b_short`.

---

## 구현 순서(각 단계 독립 검증)
1. **파이프라인 트랙 지원** + `ldb_z` 2트랙 재적재 → DB에 fi·sd 공존 확인(SQL). *(데이터 먼저)*
2. **스키마/로더** (`rdb.track`·`db_meta.track`·`db_track`) + verify(트랙별 연결성).
3. **백엔드** 트랙 필터 쿼리 + `/api/law/list` 트랙 노출. curl로 트랙별 트리 확인.
4. **프론트** 토글 + 재fetch. 실제 화면 검증.

## 리스크/주의
- 재귀 CTE는 5단(step5) 경로만 트랙 추가 → step5 분기에 집중.
- `ldb_z` 재적재 시 Phase1 큐레이션(별표 수동링크 등) 있으면 overrides로 보존.
- 트랙 prefix가 들어가도 `편-조`(`-`)·`가지/항호`(`_`) 파싱 불변(구분자 `.` 분리).
- 운영 배포는 z 재적재 후 복제 + db_track/registry 별도.
