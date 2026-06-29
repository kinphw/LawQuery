# -*- coding: utf-8 -*-
"""
ANNEX/표 구조화 재처리 — EUR-Lex 추출본의 마지막 조에 합쳐진 ANNEX(부속서)를 분리하고,
평문화된 표(CORRELATION TABLE 등)를 markdown 표로 복원, 중복·과개행 정리 + 재번역한다.
결과는 fin_law_db.law_provision 에 직접 반영(별도 보조 테이블 없음):
  - 본문: 해당 조 대표 provision UPDATE(정리된 원문/번역), 나머지 본문 provision 삭제
  - ANNEX: 새 provision INSERT (article_no='ANNEX I'…, part_no='부속서', ordinal 큰 값=맨 뒤)
  - 표는 text_original/text_ko 에 markdown 으로 저장(프론트가 표로 렌더). 스키마 변경 없음.

재실행 안전: 분리된 조는 본문에 ANNEX 텍스트가 없어 다음 실행 때 대상에서 자동 제외(idempotent).
원본은 sentinel 이 보유(fin_law_db 재적재로 복원 가능).

사용
  FINDB_ROOT_PW=genius python fill_struct.py --code eu_psd2,eu_psd3,eu_psr,eu_tfr
  FINDB_ROOT_PW=genius python fill_struct.py --code eu_micar
  FINDB_ROOT_PW=genius python fill_struct.py --code eu_psd2 --dry   # 분할만 확인(저장 안 함)
"""
import os, sys, io, re, json, argparse, time, requests, pymysql
from collections import OrderedDict
from dotenv import load_dotenv

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
load_dotenv(r"c:/projects/killEng/key.env")
OPENAI_KEY = (os.getenv("OPENAI_API_KEY") or "").strip()
OPENAI_URL = "https://api.openai.com/v1/chat/completions"

SYS = (
    "다음은 EU 법령의 일부(조 본문 또는 부속서 ANNEX)다. EUR-Lex 추출 과정에서 줄바꿈이 과하고, "
    "같은 항목이 중복되며, 표(예: 2열 대응표 CORRELATION TABLE)가 평문으로 풀어져 있다.\n"
    "정리 규칙:\n"
    "- 표는 GitHub markdown 표로 복원(헤더 + |---| 구분행).\n"
    "- 과도한 줄바꿈/중복 문장 제거, 항목((a),(1) 등) 구조 유지.\n"
    "- 원문 의미 보존(요약·누락 금지).\n"
    "- korean_md 는 정확한 한국어 법률 번역(표도 같은 구조로 번역).\n"
    "반드시 JSON만 출력: "
    '{"title":"제목(예: ANNEX I — PAYMENT SERVICES, 없으면 \\"\\")","original_md":"...","korean_md":"...","has_table":true|false}'
)


def openai_struct(text, model):
    data = {"model": model, "temperature": 0.1, "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": SYS}, {"role": "user", "content": text}]}
    r = requests.post(OPENAI_URL, headers={
        "Authorization": f"Bearer {OPENAI_KEY}", "Content-Type": "application/json"}, json=data, timeout=300)
    r.raise_for_status()
    return json.loads(r.json()["choices"][0]["message"]["content"])


def split_annex(text):
    parts = re.split(r'(?=(?:^|\n)ANNEX\s+[IVXLC0-9]+\b)', text)
    out = []
    for i, seg in enumerate(parts):
        seg = seg.strip()
        if not seg:
            continue
        m = re.match(r'ANNEX\s+[IVXLC0-9]+', seg)
        out.append((m.group(0) if m else ("본문" if i == 0 else "본문"), seg))
    return out


def chunk(seg, limit=12000):
    if len(seg) <= limit:
        return [seg]
    chunks, buf, cur = [], [], 0
    for ln in seg.split("\n"):
        if cur + len(ln) > limit and buf:
            chunks.append("\n".join(buf)); buf, cur = [], 0
        buf.append(ln); cur += len(ln) + 1
    if buf:
        chunks.append("\n".join(buf))
    return chunks


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--code", required=True)
    ap.add_argument("--article", default="")
    ap.add_argument("--model", default="gpt-4o")
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()
    if not OPENAI_KEY:
        print("ERROR: OPENAI_API_KEY 없음"); sys.exit(1)
    pw = os.environ.get("FINDB_ROOT_PW")
    if not pw:
        print("ERROR: FINDB_ROOT_PW 필요"); sys.exit(1)

    conn = pymysql.connect(host="localhost", user="root", password=pw,
                           database="fin_law_db", charset="utf8mb4", autocommit=False)
    cur = conn.cursor(pymysql.cursors.DictCursor)

    for code in [c.strip() for c in args.code.split(",") if c.strip()]:
        cur.execute("SELECT id FROM law WHERE code=%s", (code,))
        law = cur.fetchone()
        if not law:
            print(f"{code}: 없음"); continue
        lid = law["id"]
        if args.article:
            cur.execute("""SELECT article_no FROM law_provision WHERE law_id=%s AND article_no=%s
                           GROUP BY article_no""", (lid, args.article))
        else:
            cur.execute("""SELECT article_no FROM law_provision
                            WHERE law_id=%s AND article_no NOT LIKE 'ANNEX%%'
                              AND text_original REGEXP 'ANNEX [IVX0-9]'
                            GROUP BY article_no""", (lid,))
        targets = [r["article_no"] for r in cur.fetchall()]
        print(f"\n=== {code}: 대상 article {targets} ===")

        for art in targets:
            cur.execute("""SELECT id, ordinal FROM law_provision
                            WHERE law_id=%s AND article_no=%s ORDER BY ordinal""", (lid, art))
            provs = cur.fetchall()
            cur.execute("""SELECT GROUP_CONCAT(text_original ORDER BY ordinal SEPARATOR '\n') t
                            FROM law_provision WHERE law_id=%s AND article_no=%s""", (lid, art))
            text = cur.fetchone()["t"] or ""
            segs = split_annex(text)
            labels = [s[0] for s in segs]
            print(f"  Art.{art}: 블록 {labels}")
            if len(segs) <= 1:
                print("    (ANNEX 분할 없음 — 스킵)"); continue

            body_en, body_ko = [], []
            annex = OrderedDict()
            for label, seg in segs:
                for pi, piece in enumerate(chunk(seg)):
                    try:
                        res = openai_struct(piece, args.model)
                    except Exception as e:
                        b = getattr(getattr(e, "response", None), "text", "")
                        print(f"    [{label}#{pi}] 실패: {e} {b[:120]}")
                        res = {"title": "", "original_md": piece, "korean_md": ""}
                    if label == "본문":
                        body_en.append(res.get("original_md") or "")
                        body_ko.append(res.get("korean_md") or "")
                    else:
                        g = annex.setdefault(label, {"title": res.get("title") or label, "en": [], "ko": []})
                        g["en"].append(res.get("original_md") or "")
                        g["ko"].append(res.get("korean_md") or "")
                    print(f"    [{label}#{pi}] table={bool(res.get('has_table'))} "
                          f"en={len(res.get('original_md') or '')} ko={len(res.get('korean_md') or '')}")
                    time.sleep(0.2)

            if args.dry:
                continue

            rep = provs[0]["id"]
            ben, bko = "\n\n".join(x for x in body_en if x), "\n\n".join(x for x in body_ko if x)
            cur.execute("UPDATE law_provision SET text_original=%s, text_ko=%s, char_count=%s WHERE id=%s",
                        (ben, bko, len(ben), rep))
            for p in provs[1:]:
                cur.execute("DELETE FROM law_provision WHERE id=%s", (p["id"],))
            seq = 0
            for label, g in annex.items():
                en, ko = "\n\n".join(g["en"]), "\n\n".join(g["ko"])
                cur.execute(
                    """INSERT INTO law_provision
                       (law_id, ordinal, part_no, article_no, heading, seg_kind, text_original, text_ko, char_count)
                       VALUES (%s,%s,'부속서',%s,%s,'other',%s,%s,%s)""",
                    (lid, 90000 + seq, label, g["title"][:255], en, ko, len(en)))
                seq += 1
            conn.commit()
            print(f"    → 본문 UPDATE + ANNEX {seq}건 INSERT")
    conn.close()
    print("\n완료")


if __name__ == "__main__":
    main()
