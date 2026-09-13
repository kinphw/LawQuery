# 로컬(오프라인) 배포본

폐쇄망처럼 인터넷이 닿지 않는 환경에서 **브라우저만으로** 동작하는 사본.
호스팅이 메인이고, 이것은 **필요할 때 뽑아내는 부산물**이다.

## 1. 원칙 — 포크하지 않는다

로컬판을 별도 코드로 뜨면 반드시 갈라져서 죽는다. 이 프로젝트는 이미 한 번 겪었다.
최초 버전(2025-03)이 sql.js + base64 임베딩으로 서버 없이 돌던 것이 8주 만에 사라진 이유가 그것이다.

그래서 **소스는 하나, 빌드 타깃만 둘**이다. 갈아끼우는 것은 딱 두 모듈뿐이다.

| 대체 대상 | 로컬판 구현 | 무엇이 달라지나 |
|---|---|---|
| `backend/ts/common/DbContext` | `src/local/SqlJsDbContext.ts` | MySQL(mysql2) → SQLite(sql.js/WASM) |
| `backend/ts/auth/middleware/authGuard` | `src/local/authStub.ts` | 회원·게이팅 → 전량 개방(항상 pro) |

치환은 `webpack.local.config.js` 의 `NormalModuleReplacementPlugin` 이 한다.
덕분에 **백엔드 Model/Controller 와 프론트 코드는 한 글자도 고치지 않는다.**

## 2. 구조

```
                    ┌── 프론트 번들 (100% 공유) ──┐
                    │      ApiUrlBuilder           │  ← 모든 요청이 지나는 단 하나의 목
                    └──────────┬───────────────────┘
              호스팅(메인)      │      로컬(추출본)
         /api/* → Express      │      localApi.ts (fetch 가로채기)
                    │          │            │
              DbContext ───────┴──── SqlJsDbContext
                    │                       │
                 MySQL                   SQLite
                    └── 법령·해석 Model 1,881줄 공유 ──┘
```

`src/local/` 구성:

| 파일 | 역할 |
|---|---|
| `SqlJsDbContext.ts` | `DbContext` 와 같은 계약(`getInstance` 동기 / `query` 비동기). MySQL `REGEXP` 를 사용자 함수로 보충 |
| `authStub.ts` | 게이트를 무조건 통과시킨다(전량 개방). jsonwebtoken·bcrypt 가 브라우저 번들에 끌려오는 것도 막는다 |
| `localApi.ts` | 라우트 표 + Express req/res 흉내 + `window.fetch` 가로채기. 컨트롤러는 백엔드 것을 그대로 호출 |
| `installFirst.ts` | 프론트 엔트리보다 **먼저** 평가되게 하는 순서 보장용 |
| `entry/*.local.ts` | 진입점 (installFirst → 호스팅판 엔트리 순서로 import) |
| `auth-gate.local.js` | `<head>` 에서 도는 호스팅판 `auth-gate.js` 를 같은 파일명으로 덮어쓴다 → HTML 무수정 |

## 3. 만드는 법

**전달용 사본을 뽑을 때 — 이게 기본이다.**

```bash
npm run local:zip
```

또는 프로젝트 루트의 **`build-offline.bat` 더블클릭**. 같은 일을 한다
(추출 → 번들 → 패키징 → zip → 결과 폴더 열기). MySQL 이 켜져 있어야 한다.

산출물: `release/LawQuery-Portable-YYYYMMDD.zip` (**약 16MB**)
이 zip 한 장만 전달하면 된다. 받은 사람은 풀고 `index.html` 을 더블클릭한다.

**날짜가 곧 판(版)이다.** 별도 버전관리가 없으니 데이터를 뽑은 날짜를 버전처럼 쓴다(CalVer).
같은 날 다시 뽑으면 `-2`·`-3` 이 붙어 이전 사본을 덮어쓰지 않는다.
에디션명 `Portable` 은 설치 없이 풀어 쓰고 USB 로 옮기는 성격을 그대로 가리킨다. 사본 안에서도 상단 바와 ⓘ 정보창에 데이터 기준일이 표시된다.

파일명에 한글을 쓰지 않는다 — 폐쇄망으로 건네는 경로(메일 게이트웨이·USB·구형 압축도구)에서
한글 이름이 깨지거나 거부되는 일이 흔하다.

서버 배포용 폴더만 필요하면:

```bash
npm run local          # dist-local/ 만 (zip 없음)
```

산출물 3종 — 모두 `.gitignore` 대상이다.

| 폴더 | 용량 | 언제 |
|---|---|---|
| `dist-local/` | 47MB | 서버·공유폴더에서 직접 호스팅. 법령별 지연 로딩이라 첫 화면이 0.85MB로 가볍다. **압축할 이유가 없다**(전달물이 아님) |
| `dist-local-offline/` | 62MB | zip 을 만들기 위한 중간 산출물. `.sqlite`·`.wasm` 을 base64 로 실어 나른다(1.33배) |
| `release/` | 16MB | **실제 전달물**. 위 폴더를 압축한 zip 이 날짜별로 쌓인다 |

## 4. 개발 중에 확인하기 — 압축을 풀지 않고

배포본 폴더가 이미 있으므로 zip 을 풀 필요가 없다.

```bash
npm run local:verify          # ★ file:// 자동 검증 (headless Chrome) — 가장 확실
npm run local:open            # 전달본과 같은 방식(file://)으로 브라우저에 띄운다
npm run local:open interpretation   # 유권해석 화면
npm run local:serve           # dist-local(http 배포본)을 :5100 으로 서빙
npm run local:serve:offline   # dist-local-offline 을 :5100 으로 서빙
```

- **`local:verify`** 가 기본이다. 두 페이지를 실제 `file://` 로 열어 표가 그려졌는지 센다
  (법령 280행 / 유권해석 101행). 눈으로 보는 것을 대신하고, 사람이 놓치는 것을 잡는다.
- **`local:open`** 은 `dist-local-offline/index.html` 을 그대로 연다 — 받는 사람이 더블클릭하는 것과
  같은 경로다. 탐색기에서 직접 더블클릭해도 똑같다.
- **`local:serve`** 는 http 배포본(지연 로딩)을 볼 때 쓴다.
  ⚠️ 이걸로 잘 돈다고 `file://` 에서도 된다고 판단하면 안 된다 — 아래 함정 참조.

## 5. ★ 정보유출 방지 — 자동 검사

배포본은 **폐쇄망으로 건네지는 사본**이다. 서비스가 어디서 도는지 추정할 수 있는 정보가
한 글자도 실려서는 안 된다. 수동 확인은 언젠가 빠지므로 빌드에 못박아 두었다.

`scripts/build-local.js` 의 `auditLeaks()` 가 두 배포본을 검사하고, 걸리면 **빌드를 실패시키고
zip 을 만들지 않는다.** 금지 패턴 14종 — 서비스 도메인(`codexa`·`kro.kr`·`pnest`),
운영자·저장소(`kinphw`·`sncmlife`·`github.com/*/LawQuery`), 자격증명(`MYSQL_*`·`JWT_SECRET`·
`APP_TOKEN`·`ldbuser`·`password_hash`), 빌드 PC 경로(`C:\projects`).
`.sqlite` 는 전수 검사한다(회원 테이블이 실수로 딸려 가는 사고를 잡기 위해).

**바깥을 가리키는 문구는 한 곳에만 둔다** — `common/components/appInfo.ts`(ⓘ 정보 모달).
로컬 빌드는 이 모듈을 `src/local/appInfoStub.ts` 로 치환해 외부 링크 0개로 만든다.
새 링크·주소·연락처를 추가할 일이 생기면 **반드시 그 파일 안에만** 두어야 한다.
다른 컴포넌트에 흩어 놓으면 검사에 걸려 빌드가 멈춘다(그게 목적이다).

이어서 `verifyZip()` 이 완결성을 본다 — 필수 항목 8종이 다 들어갔는지, 경로 구분자가 zip 규격
(슬래시)인지. 하나라도 어긋나면 **만들어진 zip 을 지운다.** 불완전한 사본이 전달되는 쪽이
빌드 실패보다 훨씬 나쁘기 때문이다.

> 이 세 겹은 장식이 아니다. 첫 빌드에서 ⓘ 모달의 운영 도메인이 새어 나갔고, 묵은 파일 정리가
> webpack 번들까지 지워 앱이 없는 zip 이 만들어진 적이 있다. 둘 다 용량은 그럴듯했다.

### ★ file:// 은 http 와 다르다 — 반드시 따로 검증할 것

http 로 멀쩡히 도는 배포본이 `file://` 에서는 빈 화면일 수 있다. 실제로 겪은 것:

| 원인 | 증상 | 조치 |
|---|---|---|
| `<script type="module">` | **번들이 통째로 차단** → 아무것도 안 뜸<br>`blocked by CORS policy: ... only supported for protocol schemes: http, https` | 빌드가 file:// 배포본에서만 속성 제거 (webpack 번들은 클래식이라 무관) |
| `<link rel="manifest">` | 콘솔 오류(동작에는 지장 없음) | 함께 제거 — 오프라인 사본에 PWA 는 무의미 |
| `fetch()` | 데이터·wasm 로드 실패 | base64 임베딩으로 우회(설계상 이미 해결) |
| 서비스워커 등록 | 콘솔 오류 | `auth-gate` 스텁이 `register` 를 무력화 |

`verifyOfflineHtml()` 이 위 조건을 빌드마다 정적으로 검사한다. 하지만 정적 검사는 아는 함정만
막으므로, **바꾼 뒤에는 실제로 `file://` 로 열어 봐야 한다.**

```bash
npm run local:verify
```

`scripts/verify-local.js` 가 헤드리스 Chrome 으로 두 페이지를 `file://` 로 열어 표가 그려졌는지
센다(법령 280행 / 유권해석 101행 미만이면 실패). 번들이 아예 안 돌면 표 0행으로 잡힌다 —
`type="module"` 을 일부러 되돌려 넣어 시험해 보면 정확히 그렇게 걸린다.

## 6. 지켜야 할 규율

1. **법령·해석 Model 에 MySQL 전용 문법을 새로 넣지 않는다.**
   `REGEXP` 는 어댑터가 사용자 함수로 채워 준다. `NOW()`·`INTERVAL`·`ON DUPLICATE KEY` 는
   auth·board 계열에만 있어 로컬판에 실리지 않는다.

   실제로 걸렸던 것들(모두 양쪽 호환 표현으로 고쳤고, MySQL 결과는 그대로다):

   | 쓰면 안 되는 것 | 대신 | 증상 |
   |---|---|---|
   | `LEFT(x, n)` | `SUBSTR(x, 1, n)` | `no such function: LEFT` — 위임 조회 실패 |
   | `FIELD(x, 'a', 'b')` | 합집합을 서브쿼리로 감싸고 `CASE x WHEN … END` 로 정렬 | `ORDER BY term does not match any column` |
   | `COALESCE(단일인자)` | 인자가 하나면 그 컬럼을 그대로 | `wrong number of arguments to function COALESCE()` |

   ※ SQLite 는 합집합(UNION) 결과에 ORDER BY 식을 직접 붙이는 것을 거부한다. 정렬이 필요하면
     서브쿼리로 한 겹 감쌀 것.
   ※ 고친 뒤에는 **MySQL 쪽 회귀를 반드시 확인**한다. 컨트롤러를 직접 호출해 비교하면 된다
     (로컬판 90/155/33 = MySQL 90/155/33 처럼 같은 수가 나와야 한다).
2. **로컬판에서 빠지는 기능은 라우터 레벨에서 분기한다.** Model 을 `if (로컬)` 로 오염시키지 않는다.
3. **데이터 추출은 스크립트로만 한다.** 손으로 덤프하기 시작하면 배포본이 낡는다.

## 7. 담기는 것 / 빠지는 것

포함: 국내법령 9개 전부(5단 연계표·벌칙·참조·별표) + 유권해석 12,070건.
법을 몇 개 담든 용량은 거의 변하지 않는다 — 9개 합쳐 12.4MB인 반면 유권해석 하나가 30.2MB다.

제외: 해외법령(`fin_law_db`), 회원·로그인·게이팅, 게시판, 관리자, 접속로그.
해외법령을 넣으려면 `scripts/export-local.py` 의 `PLAN` 에 한 줄 추가하면 되고 54.5MB 늘어난다.

즐겨찾기는 서버가 없으므로 `localStorage` 로 대체했다(그 브라우저 안에서만 유효).

## 8. 실측 성능 (인덱스 없음)

| 항목 | http 배포본 | file:// 배포본 |
|---|---|---|
| 첫 화면 | 법령 0.85MB만 읽음 | 페이지 로드 0.95초(16.6MB base64 파싱 포함) |
| 5단 연계표(전자금융) | 68ms · 143노드 | 68ms |
| 5단 연계표(자본시장법, 최대) | 825ms · 682노드 | 동일 |
| 다른 법령으로 전환 | 63ms (해당 SQLite 새로 로드) | 즉시(이미 메모리) |
| 유권해석 전문검색 | 125~180ms | 동일 |

## 9. 알아둘 것

- 데이터 기준일이 상단 바에 표시된다(`file://` 배포본은 데이터 스크립트에 심어 둔다).
- 서비스워커는 비활성이다. 오프라인 사본에 캐싱은 무의미하고 낡은 사본을 붙잡을 뿐이다.
- 오프라인 배포본에는 DRM 이 없다. 복제 가능한 파일로 나가므로 배포 대상과 갱신 주기는
  그때그때 판단할 것.
