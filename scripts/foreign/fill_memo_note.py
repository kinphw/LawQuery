# -*- coding: utf-8 -*-
"""
조문별 AI 해설 → ldb_auth.foreign_memo (뷰어의 '메모' 레이어).

배경: 미국 CLARITY Act 처럼 **타법 개정 방식**으로 쓰인 법은 조문만 읽어서는 뜻이 안 잡힌다.
      "1934년 증권거래법 제3조(a)에 다음을 추가한다" 뒤에 삽입조문이 이어질 뿐이라,
      *어느 법의 무엇을 어떻게 바꾸는지*와 *그래서 무엇이 정해지는지*를 따로 짚어줘야 한다.
      그 해설을 조(article_no)의 첫 seg 에 메모로 붙인다.

메모 레이어를 쓰는 이유(교정 레이어와 다름)
  · 원문·번역(fin_law_db)은 건드리지 않는다 — 해설은 어디까지나 주석이다.
  · 메모는 ldb_auth 소유라 원문 재적재·운영 이관에 지워지지 않는다.
  · anchor_hash(원문 지문)를 함께 저장 → 재적재로 seg 가 밀려도 같은 조문을 다시 찾아간다.

방식
  · 조 단위로 원문(EN)을 통째 읽고(길면 MAX_ART_CHARS 까지) 한국어 해설 생성. 1조 = 1요청.
  · 결과는 '【AI 해설】' 머리표를 달아 저장한다 — 검증된 원문이 아니라 참고용 주석임을 명시.
  · 재실행 안전: 이미 메모가 있는 조는 건너뛴다. 사람이 쓴 메모를 덮지 않는다.
    (--force 는 AI 해설 머리표가 붙은 메모만 다시 만든다 — 사람 메모는 그래도 보존)

사용
  FINDB_ROOT_PW=genius python fill_memo_note.py --code us_clarity
  FINDB_ROOT_PW=genius python fill_memo_note.py --code us_clarity --limit 3 --dry
  FINDB_ROOT_PW=genius python fill_memo_note.py --code us_clarity --force --model gpt-4o
"""
import os, sys, io, json, time, hashlib, argparse, requests, pymysql
from dotenv import load_dotenv

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
load_dotenv(r"c:/projects/killEng/key.env")
KEY = (os.getenv("OPENAI_API_KEY") or "").strip()
URL = "https://api.openai.com/v1/chat/completions"
AUTH_DB = os.environ.get("AUTH_DB", "ldb_auth")

MARK = "【AI 해설】"
MAX_ART_CHARS = 14000   # 조 하나당 프롬프트에 실을 상한

SYS = (
    "당신은 한국 금융감독기관의 법령 담당자에게 외국 법령을 브리핑하는 실무자다.\n"
    "아래 조문(원문)을 읽고, 그 조를 **처음 보는 사람이 이해할 수 있도록** 한국어 해설을 쓴다.\n"
    "이 해설은 조문 옆에 붙는 주석이다. 읽는 사람은 원문도 같이 보고 있다.\n"
    "\n"
    "[반드시 담을 것 — 이 순서로]\n"
    "1) **어느 법에 들어가는가** — 이 조가 어느 법의 어느 조를 어떻게 바꾸는지(신설·대체·삭제·재배열).\n"
    "   타법 개정 방식이라 본문이 삽입문 뿐이면, 그 삽입문이 결국 **어느 법에 들어가 살게 되는지**를 먼저 밝힌다.\n"
    "   이 점이 제일 중요하다 — 읽는 사람이 조문만 보고는 절대 알 수 없는 정보다.\n"
    "   개정이 아니라 이 법 자체의 규정이면 그 점을 한 마디로 밝히고 2)로 간다.\n"
    "2) **실질 내용** — 그 결과 누가·무엇을·언제까지 해야 하는지. 금액·기한·비율·요건은 숫자 그대로 옮긴다.\n"
    "3) **감독체계에 미치는 영향** — 이 조가 시행되면 가상자산 관리·감독의 지형이 어떻게 바뀌는가.\n"
    "   누가 감독하게 되는지(SEC / CFTC / FinCEN·재무부 / 연방은행감독기구 / 주 감독당국), 종전에 누가 하던 것이\n"
    "   어디로 옮겨가거나 사라지는지, 등록·인가·보고·검사 중 무엇이 새로 생기는지, 적용이 배제되어\n"
    "   **감독 사각이나 규제차익**이 생기는 지점이 있으면 그것까지 짚는다.\n"
    "   **이 항목이 이 해설의 존재 이유다 — 빠뜨리면 실격이다.** 조문이 순수 기술적 정비라 감독 지형이\n"
    "   안 바뀌면 '감독 배분에는 변화가 없다'고 명시한다(지어내지 말 것).\n"
    "4) **읽을 때 주의점** — 정의가 다른 법에 걸려 있거나, 다른 조와 함께 읽어야 뜻이 잡히면 그 조를 짚는다.\n"
    "   해당 사항이 없으면 생략한다(억지로 채우지 말 것).\n"
    "\n"
    "[정의(Definitions) 조문일 때]\n"
    "• 용어를 전부 나열하지 말 것 — 목록은 원문에 이미 있다. 실격이다.\n"
    "• 대신 **그 정의들이 무슨 일을 하는지**를 쓴다: 어느 법의 용어체계에 무엇이 새로 들어가고,\n"
    "  그래서 규제 관할(예: SEC 대 CFTC)이나 적용 범위가 어떻게 갈리는지. 축이 되는 정의 2~3개만 이름을 든다.\n"
    "\n"
    "[형식]\n"
    "• 4~7문장, **최대 750자**. 설명체('~한다', '~이다'). 개조식 머리기호(-, •, ①) 쓰지 말 것.\n"
    "• 조 제목의 환언 금지 — '정의를 규정한다' 같은 문장은 정보가 없다. 실격이다.\n"
    "• 맺음말 금지 — '법적 명확성을 제공하기 위한 것이다', '~를 목적으로 한다' 같은 빈 문장으로 끝내지 말 것.\n"
    "  마지막 문장까지 사실을 담는다.\n"
    "• 원문에 없는 사실을 지어내지 말 것. 조문에서 확인되는 것만 쓴다.\n"
    "• 법률 용어는 한국 실무 용어로 옮긴다(credit transfer=입금이체, competent authority=관할 당국,\n"
    "  digital commodity=디지털 상품, security=증권).\n"
    "\n"
    'JSON만 출력: {"note":"해설"}'
)


def _post(messages, model, response_format=None, timeout=180):
    d = {"model": model, "temperature": 0.2, "messages": messages}
    if response_format:
        d["response_format"] = response_format
    r = requests.post(URL, headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
                      json=d, timeout=timeout)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


def anchor_hash(text_original, heading):
    """ForeignModel.anchorHash 와 동일 규칙 — 공백만 정규화한 원문의 sha256."""
    src = text_original if (text_original or "").strip() else (heading or "")
    norm = " ".join(str(src).split())
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()


def build_body(segs):
    """조의 seg 들을 depth 들여쓰기로 이어붙여 원문 한 덩어리로."""
    lines = []
    for s in segs:
        t = (s["text_original"] or "").strip()
        if t:
            lines.append("  " * min(int(s["depth"] or 0), 8) + t.replace("\n", " "))
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--code", required=True)
    ap.add_argument("--model", default="gpt-4o")
    ap.add_argument("--limit", type=int, default=0, help="조 개수 상한(시범 생성용)")
    ap.add_argument("--article", default="", help="특정 조만(콤마구분)")
    ap.add_argument("--force", action="store_true", help="기존 AI 해설을 다시 생성(사람 메모는 보존)")
    ap.add_argument("--dry", action="store_true", help="DB 쓰지 않고 출력만")
    args = ap.parse_args()
    pw = os.environ.get("FINDB_ROOT_PW")
    if not KEY or not pw:
        print("ERROR: OPENAI_API_KEY / FINDB_ROOT_PW 필요"); return 1

    conn = pymysql.connect(host="localhost", user="root", password=pw,
                           database="fin_law_db", charset="utf8mb4", autocommit=False)
    cur = conn.cursor(pymysql.cursors.DictCursor)
    cur.execute("SELECT id, title_ko, title_original FROM law WHERE code=%s", (args.code,))
    law = cur.fetchone()
    if not law:
        print(f"{args.code}: 없음"); return 1

    # 조별 seg (seg_index = 조 내 1-based 순위 = 메모 앵커)
    cur.execute(
        """SELECT article_no, heading, depth, text_original, ordinal,
                  ROW_NUMBER() OVER (PARTITION BY article_no ORDER BY ordinal) AS seg_index
             FROM law_provision WHERE law_id=%s ORDER BY ordinal""", (law["id"],))
    rows = cur.fetchall()

    arts, order = {}, []
    for r in rows:
        a = r["article_no"]
        if a not in arts:
            arts[a] = []; order.append(a)
        arts[a].append(r)
    if args.article:
        want = {x.strip() for x in args.article.split(",") if x.strip()}
        order = [a for a in order if a in want]

    # 기존 메모 — 사람이 쓴 건 절대 덮지 않는다.
    cur.execute(f"SELECT article_no, seg_index, memo FROM {AUTH_DB}.foreign_memo WHERE law_code=%s", (args.code,))
    existing = {(r["article_no"], r["seg_index"]): (r["memo"] or "") for r in cur.fetchall()}

    todo = []
    for a in order:
        first = arts[a][0]
        key = (a, 1)
        old = existing.get(key)
        if old is not None:
            if not args.force or not old.startswith(MARK):
                continue
        todo.append((a, first))
    if args.limit:
        todo = todo[:args.limit]

    print(f"{args.code}: 조 {len(order)} / 해설 생성 대상 {len(todo)}")
    done = 0
    for a, first in todo:
        body = build_body(arts[a])[:MAX_ART_CHARS]
        head = (first["heading"] or "").strip()
        user = (f"법령: {law['title_original']}\n"
                f"조: §{a}" + (f" {head}" if head else "") + "\n\n원문:\n" + body)
        try:
            out = _post([{"role": "system", "content": SYS}, {"role": "user", "content": user}],
                        args.model, {"type": "json_object"})
            note = (json.loads(out).get("note") or "").strip()
        except Exception as e:
            print(f"  §{a} 실패: {e}"); continue
        if not note:
            print(f"  §{a} 빈 응답 — skip"); continue
        memo = f"{MARK}\n{note}"
        if args.dry:
            print(f"\n── §{a} {head}\n{note}\n")
        else:
            ah = anchor_hash(first["text_original"], first["heading"])
            cur.execute(
                f"""INSERT INTO {AUTH_DB}.foreign_memo (law_code, article_no, seg_index, memo, anchor_hash)
                    VALUES (%s,%s,1,%s,%s)
                    ON DUPLICATE KEY UPDATE memo=VALUES(memo), anchor_hash=VALUES(anchor_hash)""",
                (args.code, a, memo, ah))
            conn.commit()
        done += 1
        if done % 5 == 0:
            print(f"  …{done}/{len(todo)}")
        time.sleep(0.1)
    print(f"  {args.code} 완료: {done}/{len(todo)} 조 해설")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
