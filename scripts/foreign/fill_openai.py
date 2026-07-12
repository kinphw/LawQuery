# -*- coding: utf-8 -*-
"""
seg-level 번역 — law_provision 의 미번역 seg(text_ko NULL/'')를 OpenAI 로 번역.
  · 짧은 seg(<=3000자)는 배치(JSON, 여러 seg 한 요청)로 효율 처리.
  · 긴 seg(article-unit 법령의 큰 조 등)는 개별 + 문단 청크.
  · source_lang 은 law.jurisdiction 자동(jp→JA, else EN). markdown 표는 구조 보존.
재실행 안전(미번역분만). text_ko 는 LQ 소유 — STN 은 NULL 적재.

사용
  FINDB_ROOT_PW=genius python fill_openai.py --code eu_psd2
  FINDB_ROOT_PW=genius python fill_openai.py --code eu_crr,eu_crd --model gpt-4o-mini
"""
import os, sys, io, json, argparse, time, requests, pymysql
from dotenv import load_dotenv

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
load_dotenv(r"c:/projects/killEng/key.env")
KEY = (os.getenv("OPENAI_API_KEY") or "").strip()
URL = "https://api.openai.com/v1/chat/completions"
LANG = {"JA": "Japanese", "EN": "English"}


def _post(messages, model, response_format=None):
    d = {"model": model, "temperature": 0.2, "messages": messages}
    if response_format:
        d["response_format"] = response_format
    r = requests.post(URL, headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
                      json=d, timeout=180)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


def translate_one(text, lang, model):
    """긴 seg 개별 — 6000자 초과 시 문단 청크."""
    sysp = (f"Translate the following {lang} statutory/legal text into Korean (한국어). "
            "Preserve the exact line breaks and the leading indentation of every line "
            "(the nesting hierarchy is encoded by newlines + 2-space-per-level indent — keep it identical). "
            "Preserve numbering/markers and any markdown tables. Output only the Korean translation.")
    if len(text) <= 6000:
        return _post([{"role": "system", "content": sysp}, {"role": "user", "content": text}], model).strip()
    chunks, buf = [], ""
    for para in text.split("\n"):
        if buf and len(buf) + len(para) > 5000:
            chunks.append(buf); buf = para
        else:
            buf = (buf + "\n" + para) if buf else para
    if buf:
        chunks.append(buf)
    return "\n".join(_post([{"role": "system", "content": sysp}, {"role": "user", "content": c}], model).strip()
                     for c in chunks)


def translate_batch(items, lang, model):
    """짧은 seg 묶음 [(id, text)] → {id: ko}."""
    sysp = (f"You are a legal translator. Translate each {lang} segment into Korean (한국어). "
            "Preserve the exact line breaks (\\n) and leading indentation of each segment — the nesting "
            "hierarchy is encoded by newlines + 2-space-per-level indent, so keep it byte-for-byte in the "
            "Korean output. Preserve markers ((a),(1),1.) and markdown tables. Return JSON ONLY: "
            '{"items":[{"i":<i>,"ko":"<번역>"}]}')
    user = json.dumps([{"i": i, "t": t} for i, t in items], ensure_ascii=False)
    out = _post([{"role": "system", "content": sysp}, {"role": "user", "content": user}],
                model, {"type": "json_object"})
    return {x["i"]: x["ko"] for x in json.loads(out).get("items", [])}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--code", required=True)
    ap.add_argument("--model", default="gpt-4o-mini")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--article", default="", help="특정 article_no 그룹만 번역(예: 'PRE:2011-31725'). "
                                                  "'PRE:%%' 처럼 LIKE 패턴도 가능(예: 서문 전체 = --article 'PRE:%%')")
    args = ap.parse_args()
    pw = os.environ.get("FINDB_ROOT_PW")
    if not KEY or not pw:
        print("ERROR: OPENAI_API_KEY / FINDB_ROOT_PW 필요"); sys.exit(1)

    conn = pymysql.connect(host="localhost", user="root", password=pw,
                           database="fin_law_db", charset="utf8mb4", autocommit=False)
    cur = conn.cursor(pymysql.cursors.DictCursor)

    for code in [c.strip() for c in args.code.split(",") if c.strip()]:
        cur.execute("SELECT id, jurisdiction FROM law WHERE code=%s", (code,))
        law = cur.fetchone()
        if not law:
            print(f"{code}: 없음"); continue
        lang = LANG.get("JA" if law["jurisdiction"] == "jp" else "EN")
        art_sql = " AND article_no LIKE %s" if "%" in args.article else (" AND article_no=%s" if args.article else "")
        art_params = (args.article,) if args.article else ()
        cur.execute(
            """SELECT id, text_original FROM law_provision
                WHERE law_id=%s AND text_original IS NOT NULL AND text_original<>''
                  AND (text_ko IS NULL OR text_ko='')""" + art_sql +
            " ORDER BY ordinal", (law["id"], *art_params))
        rows = cur.fetchall()
        if args.limit:
            rows = rows[:args.limit]
        total = len(rows)
        print(f"{code}[{lang}]: 미번역 seg {total}")

        done = 0
        batch, batch_chars = [], 0

        def flush():
            nonlocal done, batch, batch_chars
            if not batch:
                return
            try:
                res = translate_batch([(r["id"], r["text_original"]) for r in batch], lang, args.model)
            except Exception as e:
                print(f"  batch fail: {e}"); res = {}
            for r in batch:
                ko = res.get(r["id"])
                if ko:
                    cur.execute("UPDATE law_provision SET text_ko=%s WHERE id=%s", (ko, r["id"]))
                    done += 1
            conn.commit()
            batch, batch_chars = [], 0
            print(f"  …{done}/{total}")

        for r in rows:
            t = r["text_original"]
            if len(t) > 3000:
                flush()
                try:
                    ko = translate_one(t, lang, args.model)
                    cur.execute("UPDATE law_provision SET text_ko=%s WHERE id=%s", (ko, r["id"]))
                    done += 1; conn.commit()
                    print(f"  …{done}/{total} (long seg)")
                except Exception as e:
                    print(f"  long seg fail id={r['id']}: {e}")
            else:
                batch.append(r); batch_chars += len(t)
                if len(batch) >= 25 or batch_chars >= 6000:
                    flush()
            time.sleep(0.05)
        flush()
        print(f"  {code} 완료: {done}/{total} seg 번역")

    conn.close()


if __name__ == "__main__":
    main()
