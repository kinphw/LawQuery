# -*- coding: utf-8 -*-
"""
OpenAI(chat completions) 번역 적재 — DeepL 한도 소진 시 대체 경로.
fill_deepl.py 와 동일하게 조문(article) 단위로 대표 provision(ordinal 최소)에 text_ko 저장.
이미 번역된 article(대표 text_ko 존재)은 건너뛴다 → 재실행 안전.

키: killEng/key.env 의 OPENAI_API_KEY. 모델 기본 gpt-4o-mini(토큰 절약).
source_lang 은 law.jurisdiction 으로 자동(jp→Japanese, else English).

사용
  FINDB_ROOT_PW=genius python fill_openai.py --code jp_banking,jp_psa,jp_psa_enf,jp_funds_transfer_co
  FINDB_ROOT_PW=genius python fill_openai.py --code jp_banking --limit 1   # 테스트
  FINDB_ROOT_PW=genius python fill_openai.py --code jp_banking --model gpt-4o
"""
import os, sys, io, argparse, time, requests, urllib3, pymysql
from dotenv import load_dotenv

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

load_dotenv(r"c:/projects/killEng/key.env")
OPENAI_KEY = (os.getenv("OPENAI_API_KEY") or "").strip()
URL = "https://api.openai.com/v1/chat/completions"
LANG = {"JA": "Japanese", "EN": "English"}


def translate(text: str, source: str, model: str) -> str:
    lang = LANG.get(source, "English")
    system = (
        f"You are a professional legal translator. Translate the following {lang} "
        "statutory/legal text into Korean (한국어). Preserve article/paragraph/item "
        "numbering and legal terminology accurately. Output ONLY the Korean translation, "
        "with no preamble or notes."
    )
    data = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": text},
        ],
        "temperature": 0.2,
    }
    r = requests.post(URL, headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {OPENAI_KEY}",
    }, json=data, timeout=180)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"].strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--code", required=True, help="쉼표구분 law code")
    ap.add_argument("--limit", type=int, default=0, help="법령당 최대 article(0=전체)")
    ap.add_argument("--model", default="gpt-4o-mini", help="OpenAI 모델(기본 gpt-4o-mini)")
    args = ap.parse_args()

    if not OPENAI_KEY:
        print("ERROR: OPENAI_API_KEY 없음(killEng/key.env)"); sys.exit(1)
    pw = os.environ.get("FINDB_ROOT_PW")
    if not pw:
        print("ERROR: FINDB_ROOT_PW 필요"); sys.exit(1)

    conn = pymysql.connect(host="localhost", user="root", password=pw,
                           database="fin_law_db", charset="utf8mb4", autocommit=False)
    cur = conn.cursor(pymysql.cursors.DictCursor)

    grand = 0
    for code in [c.strip() for c in args.code.split(",") if c.strip()]:
        cur.execute("SELECT id, jurisdiction FROM law WHERE code=%s", (code,))
        law = cur.fetchone()
        if not law:
            print(f"{code}: DB law 없음"); continue
        lid = law["id"]
        src = "JA" if law["jurisdiction"] == "jp" else "EN"
        cur.execute(
            """SELECT id, article_no, ordinal, text_original, text_ko
                 FROM law_provision WHERE law_id=%s AND article_no IS NOT NULL
                ORDER BY ordinal""", (lid,))
        rows = cur.fetchall()

        groups = {}
        for r in rows:
            g = groups.setdefault(r["article_no"], {"rep_id": r["id"], "rep_ko": r["text_ko"], "en": []})
            if r["text_original"]:
                g["en"].append(r["text_original"])
        todo = [(a, g) for a, g in groups.items() if not (g["rep_ko"] and str(g["rep_ko"]).strip())]
        if args.limit:
            todo = todo[:args.limit]
        print(f"{code}[{src}/{args.model}]: article {len(groups)}개, 미번역 {len(todo)}개 시작")

        done = 0
        for i, (art, g) in enumerate(todo):
            text = "\n\n".join(g["en"]).strip()
            if not text:
                continue
            try:
                ko = translate(text, src, args.model)
            except Exception as e:
                body = getattr(getattr(e, "response", None), "text", "")
                print(f"  {code} Art.{art} 실패: {e} {body[:160]}")
                conn.commit()
                break
            cur.execute("UPDATE law_provision SET text_ko=%s WHERE id=%s", (ko, g["rep_id"]))
            done += 1
            if i % 10 == 0:
                conn.commit()
                print(f"  {i}/{len(todo)} …")
            time.sleep(0.3)
        conn.commit()
        grand += done
        print(f"  {code} 완료: {done}개 article 적재")

    print(f"전체 완료: {grand}개 article text_ko 적재")
    conn.close()


if __name__ == "__main__":
    main()
