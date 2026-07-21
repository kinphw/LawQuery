# -*- coding: utf-8 -*-
"""
조문 '주요 내용' 요약 → ldb_auth.foreign_article_gist.gist_ko (요약표 뷰 가운데 칸).

이행분석(foreign_transition_assessment.summary_ko)은 "무엇이 **바뀌었나**"라서
"이 조문이 **무슨 내용인가**"와는 다르다. 요약표 3단(조문명 · 주요내용 · 변경사항)의
가운데 칸을 채운다.

방식
  · 조 단위로 원문(EN)+번역(KO)을 묶어 배치(6개 조/요청)로 요약. 번역이 아니라 **압축**이라
    조 전체를 한 번에 봐야 해서 heading 번역(40개/요청)보다 배치를 작게 잡는다.
  · 조가 길면 앞부분만 보낸다(MAX_ART_CHARS) — 조의 성격은 앞 항에서 대개 드러난다.
  · 표 그대로 붙여 쓸 문체(개조식 '~규정한다/정한다')를 강제. 인용부호·머리기호 금지.
  · 재실행 안전: 이미 gist 가 있는 조는 건너뛴다(--force 면 다시 만든다).
  · source='llm'. 사람이 손보면 source='manual' 로 바꿔두면 이 스크립트가 덮지 않는다.

사용
  FINDB_ROOT_PW=genius python fill_gist.py --code eu_psr_2026
  FINDB_ROOT_PW=genius python fill_gist.py --code eu_psd3,eu_psr,eu_emd2,eu_psd2 --model gpt-4o
  FINDB_ROOT_PW=genius python fill_gist.py --code eu_psr_2026 --force --limit 20
"""
import os, sys, io, json, time, argparse, requests, pymysql
from dotenv import load_dotenv

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
load_dotenv(r"c:/projects/killEng/key.env")
KEY = (os.getenv("OPENAI_API_KEY") or "").strip()
URL = "https://api.openai.com/v1/chat/completions"

MAX_ART_CHARS = 5000   # 조 하나당 프롬프트에 실을 상한
BATCH = 6              # 요청당 조 개수

SYS = (
    "당신은 금융법령 실무자다. 아래 각 조문을 읽고 '이 조문이 무엇을 정하는지'를 한국어로 요약하라.\n"
    "이 요약은 보고서 표의 '주요 내용' 칸에 그대로 들어간다. 읽는 사람은 원문을 보지 않는다.\n"
    "\n"
    "[반드시 지킬 것 — 어기면 쓸모가 없다]\n"
    "• **조 제목의 환언 금지.** '초기 자본 요건을 규정한다' 같은 문장은 아무 정보가 없다. 실격이다.\n"
    "  대신 조문이 실제로 정한 내용을 적어라 — 누가·무엇을·얼마나·언제까지.\n"
    "• **숫자는 반드시 살려라.** 금액·기한·비율·일수·한도가 본문에 있으면 빠짐없이 옮긴다\n"
    "  (예: '송금업 4만 유로·계좌정보업 5만 유로', '10영업일 내', '거래액 1% 상한').\n"
    "• 항이 여럿이면 핵심 축을 2~3개 묶어 적는다. 나열이 필요하면 가운뎃점(·)으로 잇는다.\n"
    "\n"
    "[형식]\n"
    "• 1~3문장, 최대 220자. 개조식('~를 규정한다', '~하도록 정한다', '~여야 한다').\n"
    "• 개정 여부·타 법령과의 비교는 쓰지 말 것 — 그건 표의 다른 칸이 담당한다. 이 조문 자체의 내용만.\n"
    "• 머리기호(-, •)·인용부호로 감싸지 말고 평문으로. '본 조는'·'이 조항은' 같은 군더더기 금지.\n"
    "\n"
    "[예시]\n"
    "나쁨: 결제 기관의 초기 자본 요건을 최소 금액으로 규정한다.\n"
    "좋음: 결제기관의 최소 초기자본을 서비스별로 정한다 — 송금업 4만 유로, 지급지시업 5만 유로, "
    "그 밖의 결제서비스 15만 유로이며, 전자화폐 발행은 25만 유로다.\n"
    'JSON만 출력: {"items":[{"i":번호,"gist":"요약"}]}'
)


def summarize(batch, model):
    payload = []
    for i, a in enumerate(batch):
        body = a["body"][:MAX_ART_CHARS]
        payload.append({"i": i, "조": a["article_no"], "제목": a["heading"] or "", "본문": body})
    d = {"model": model, "temperature": 0.2, "response_format": {"type": "json_object"},
         "messages": [{"role": "system", "content": SYS},
                      {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}]}
    r = requests.post(URL, headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
                      json=d, timeout=180)
    r.raise_for_status()
    out = json.loads(r.json()["choices"][0]["message"]["content"]).get("items", [])
    return {int(x["i"]): (x.get("gist") or "").strip() for x in out}


def load_articles(cur, code, force, limit):
    """조 단위로 원문+번역을 합친다. 부속서·전문은 제외(요약표는 조문 표다)."""
    cur.execute("SELECT id FROM fin_law_db.law WHERE code=%s", (code,))
    law = cur.fetchone()
    if not law:
        print(f"  ! {code}: law 없음 — 건너뜀")
        return []
    cur.execute("""SELECT article_no, heading, heading_ko, para_no, text_original, text_ko
                     FROM fin_law_db.law_provision
                    WHERE law_id=%s AND article_no REGEXP '^[0-9]+[a-z]?$'
                    ORDER BY CAST(article_no AS UNSIGNED), article_no, ordinal""", (law["id"],))
    arts, order = {}, []
    for r in cur.fetchall():
        a = r["article_no"]
        if a not in arts:
            arts[a] = dict(article_no=a, heading=r["heading_ko"] or r["heading"], parts=[])
            order.append(a)
        # 번역이 있으면 번역을, 없으면 원문을 쓴다(요약은 한국어라 KO 가 효율적).
        arts[a]["parts"].append(r["text_ko"] or r["text_original"] or "")
    if not force:
        cur.execute("SELECT article_no FROM ldb_auth.foreign_article_gist "
                    "WHERE law_code=%s AND gist_ko IS NOT NULL AND gist_ko<>''", (code,))
        have = {r["article_no"] for r in cur.fetchall()}
        order = [a for a in order if a not in have]
    out = []
    for a in order:
        v = arts[a]
        v["body"] = "\n".join(p for p in v["parts"] if p)
        if v["body"].strip():
            out.append(v)
    return out[:limit] if limit else out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--code", required=True, help="콤마구분 law code")
    ap.add_argument("--model", default="gpt-4o-mini")
    ap.add_argument("--force", action="store_true", help="기존 gist 도 다시 생성(source=manual 은 제외)")
    ap.add_argument("--limit", type=int, default=0, help="법령당 최대 조 수(시험용)")
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()

    if not KEY:
        sys.exit("ERROR: OPENAI_API_KEY 없음")
    pw = os.environ.get("FINDB_ROOT_PW")
    if not pw:
        sys.exit("ERROR: FINDB_ROOT_PW 필요")
    conn = pymysql.connect(host="localhost", user="root", password=pw,
                           charset="utf8mb4", autocommit=False)
    cur = conn.cursor(pymysql.cursors.DictCursor)

    total = 0
    for code in [c.strip() for c in args.code.split(",") if c.strip()]:
        arts = load_articles(cur, code, args.force, args.limit)
        print(f"[{code}] 요약 대상 {len(arts)}개 조")
        if args.dry or not arts:
            continue
        done = 0
        for s in range(0, len(arts), BATCH):
            batch = arts[s:s + BATCH]
            try:
                res = summarize(batch, args.model)
            except Exception as e:
                print(f"  [{s}] 실패: {e}")
                break
            for i, gist in res.items():
                if not (0 <= i < len(batch)) or not gist:
                    continue
                cur.execute(
                    """INSERT INTO ldb_auth.foreign_article_gist (law_code, article_no, gist_ko, source, model)
                       VALUES (%s,%s,%s,'llm',%s)
                       ON DUPLICATE KEY UPDATE
                         gist_ko=IF(source='manual', gist_ko, VALUES(gist_ko)),
                         model=IF(source='manual', model, VALUES(model))""",
                    (code, batch[i]["article_no"], gist, args.model))
                done += 1
            conn.commit()
            print(f"  {min(s + BATCH, len(arts))}/{len(arts)} …")
            time.sleep(0.2)
        print(f"  → {code}: {done}건 적재")
        total += done
    print(f"완료: gist {total}건")
    conn.close()


if __name__ == "__main__":
    main()
