# -*- coding: utf-8 -*-
"""
범용 DeepL 번역 적재 — 엑셀 번역이 없는 해외법령(fin_law_db)의 text_ko를 DeepL로 채운다.

조문(article) 단위로 그 article 전체 원문을 번역해 대표 provision(ordinal 최소)에 저장한다.
(ForeignModel 조회가 article GROUP + MAX(text_ko) 이므로 대표 provision 저장과 일관.)
이미 번역된 article(대표 text_ko 존재)은 건너뛴다 → 재실행 안전.

DeepL 인증: killEng/key.env 의 DEEPL_API_KEY. 무료키(:fx)면 api-free 엔드포인트.
            폼 auth_key 가 아니라 'Authorization: DeepL-Auth-Key' 헤더를 써야 함.

사용
  FINDB_ROOT_PW=genius python fill_deepl.py --code us_bsa,us_efta,us_reg_e,us_ca_mt,us_ny_banking
  FINDB_ROOT_PW=genius python fill_deepl.py --code eu_psd2 --limit 1   # 1건만(테스트)
"""
import os, sys, io, argparse, time, requests, urllib3, pymysql
from dotenv import load_dotenv

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

load_dotenv(r"c:/projects/killEng/key.env")
KEY = (os.getenv("DEEPL_API_KEY") or "").strip()
URL = "https://api-free.deepl.com/v2/translate" if KEY.endswith(":fx") else "https://api.deepl.com/v2/translate"


def translate(text: str, source: str = "EN") -> str:
    r = requests.post(URL,
        headers={"Authorization": f"DeepL-Auth-Key {KEY}"},
        data={"source_lang": source, "target_lang": "KO", "text": text},
        verify=False, timeout=120)
    r.raise_for_status()
    return r.json()["translations"][0]["text"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--code", required=True, help="쉼표구분 law code")
    ap.add_argument("--limit", type=int, default=0, help="법령당 최대 article(0=전체, 테스트용)")
    args = ap.parse_args()

    if not KEY:
        print("ERROR: DEEPL_API_KEY 없음(killEng/key.env)"); sys.exit(1)
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
        src = "JA" if law["jurisdiction"] == "jp" else "EN"  # DeepL source_lang 자동
        cur.execute(
            """SELECT id, article_no, ordinal, text_original, text_ko
                 FROM law_provision WHERE law_id=%s AND article_no IS NOT NULL
                ORDER BY ordinal""", (lid,))
        rows = cur.fetchall()

        # article 단위 그룹: 대표 provision id(첫 ordinal), 대표 text_ko, 원문 조각들
        groups = {}
        for r in rows:
            g = groups.setdefault(r["article_no"], {"rep_id": r["id"], "rep_ko": r["text_ko"], "en": []})
            if r["text_original"]:
                g["en"].append(r["text_original"])
        todo = [(a, g) for a, g in groups.items() if not (g["rep_ko"] and str(g["rep_ko"]).strip())]
        if args.limit:
            todo = todo[:args.limit]
        print(f"{code}: article {len(groups)}개, 미번역 {len(todo)}개 번역 시작")

        done = 0
        for i, (art, g) in enumerate(todo):
            en = "\n\n".join(g["en"]).strip()
            if not en:
                continue
            try:
                ko = translate(en, src)
            except Exception as e:
                print(f"  {code} Art.{art} 실패: {e}")
                conn.commit()
                break
            cur.execute("UPDATE law_provision SET text_ko=%s WHERE id=%s", (ko, g["rep_id"]))
            done += 1
            if i % 10 == 0:
                conn.commit()
                print(f"  {i}/{len(todo)} …")
            time.sleep(0.2)
        conn.commit()
        grand += done
        print(f"  {code} 완료: {done}개 article 적재")

    print(f"전체 완료: {grand}개 article text_ko 적재")
    conn.close()


if __name__ == "__main__":
    main()
