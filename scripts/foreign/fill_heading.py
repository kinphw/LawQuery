# -*- coding: utf-8 -*-
"""
조 제목(heading) 한국어 번역 → law_provision.heading_ko (목차·바로가기 가독성용).
조 제목은 짧아 배치(40개/요청)로 OpenAI gpt-4o-mini 번역. 본문 내용은 건드리지 않음.
ANNEX 행은 목차에서 article_no(ANNEX I)로 표시하므로 제외. 재실행 안전(미번역분만).

사용
  FINDB_ROOT_PW=genius python fill_heading.py
"""
import os, sys, io, json, time, requests, pymysql
from dotenv import load_dotenv

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
load_dotenv(r"c:/projects/killEng/key.env")
KEY = (os.getenv("OPENAI_API_KEY") or "").strip()
URL = "https://api.openai.com/v1/chat/completions"
SYS = ("다음은 법령 조문 제목 목록(영어 또는 일본어)이다. 각 t를 한국어로 간결·정확히 번역하라"
       "(법률 용어 유지, 군더더기 없이 제목답게). JSON만 출력: "
       '{"items":[{"i":번호,"ko":"번역"}]}')


def trans_batch(items):
    user = json.dumps([{"i": i, "t": t} for i, t in items], ensure_ascii=False)
    d = {"model": "gpt-4o-mini", "temperature": 0.1, "response_format": {"type": "json_object"},
         "messages": [{"role": "system", "content": SYS}, {"role": "user", "content": user}]}
    r = requests.post(URL, headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
                      json=d, timeout=120)
    r.raise_for_status()
    return {x["i"]: x["ko"] for x in json.loads(r.json()["choices"][0]["message"]["content"]).get("items", [])}


def main():
    if not KEY:
        print("ERROR: OPENAI_API_KEY 없음"); sys.exit(1)
    pw = os.environ.get("FINDB_ROOT_PW")
    if not pw:
        print("ERROR: FINDB_ROOT_PW 필요"); sys.exit(1)
    conn = pymysql.connect(host="localhost", user="root", password=pw,
                           database="fin_law_db", charset="utf8mb4", autocommit=False)
    cur = conn.cursor(pymysql.cursors.DictCursor)
    cur.execute("""SELECT id, heading FROM law_provision
                    WHERE heading IS NOT NULL AND heading <> ''
                      AND (heading_ko IS NULL OR heading_ko = '')
                      AND article_no NOT LIKE 'ANNEX%'""")
    rows = cur.fetchall()
    print(f"제목 번역 대상: {len(rows)}건")
    done = 0
    for start in range(0, len(rows), 40):
        batch = rows[start:start + 40]
        items = [(j, batch[j]["heading"]) for j in range(len(batch))]
        try:
            res = trans_batch(items)
        except Exception as e:
            print(f"  [{start}] 실패: {e}"); break
        for j, ko in res.items():
            if 0 <= int(j) < len(batch):
                cur.execute("UPDATE law_provision SET heading_ko=%s WHERE id=%s", (ko, batch[int(j)]["id"]))
                done += 1
        conn.commit()
        print(f"  {min(start+40, len(rows))}/{len(rows)} …")
        time.sleep(0.2)
    print(f"완료: heading_ko {done}건 적재")
    conn.close()


if __name__ == "__main__":
    main()
