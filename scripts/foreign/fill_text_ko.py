# -*- coding: utf-8 -*-
"""
해외법령 영한 번역 적재: LawQuery-law/foreign/data_law 엑셀(원문|번역 2열) → fin_law_db.law_provision.text_ko

원리
  - sentinel fin_law_db 는 조문 앵커(article_no)가 정확히 채워져 있다(원문·계층 우수).
  - 엑셀에는 원문+번역이 있으나 raw 2열이다.
  - 양쪽을 article_no 로 정렬 매핑해 번역만 fin_law_db 에 채운다(원문은 sentinel 것을 유지).
  - 한 article 이 여러 provision(항/호)으로 쪼개진 경우, 대표 provision(ordinal 최소)에 번역을 저장하고
    조회는 article 단위로 GROUP 한다(백엔드 ForeignModel 참조).

사용
  FINDB_ROOT_PW=genius python fill_text_ko.py            # dry-run(통계만)
  FINDB_ROOT_PW=genius python fill_text_ko.py --commit   # 실제 UPDATE
  FINDB_ROOT_PW=genius python fill_text_ko.py --commit --only eu_psr,eu_psd3
"""
import os, re, sys, io, argparse, openpyxl, pymysql

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

DATA = os.environ.get("DATA_LAW_DIR", r"c:/projects/LawQuery-law/foreign/data_law")

# 엑셀파일 → (law.code, 관할 파서키).  PSD2 는 엑셀이 없어 DeepL 별도 적재(fill_psd2_deepl.py).
JOBS = [
    ("EU_MiCAR_raw_cleaned_merged_translated.xlsx", "eu_micar", "EU"),
    ("EU_emd2_cleaned_merged_translated.xlsx",      "eu_emd2",  "EU"),
    ("EU_psd3_cleaned_merged_translated.xlsx",      "eu_psd3",  "EU"),
    ("EU_psr_cleaned_merged_translated.xlsx",       "eu_psr",   "EU"),
    ("tfr2_cleaned_merged_translated.xlsx",         "eu_tfr",   "EU"),
    ("EU_psa_translated.xlsx",                      "sg_psa",   "EN"),  # 실제 내용=싱가포르 PSA 2019
    ("hk_amlo_translated.xlsx",                     "hk_amlo",  "EN"),
    ("hk_pssvfo_translated.xlsx",                   "hk_pssvfo","EN"),
    ("미국_BILLS-119hr1919eh_text_translated.xlsx", "us_anti_cbdc", "EN"),  # 'N. Heading' 들여쓰기
    ("미국_BILLS-119hr3633eh_text_translated.xlsx", "us_clarity",   "EN"),
    ("미국_BILLS-119s1582enr_text_translated.xlsx", "us_genius",    "EN"),
    ("일본_자금결제법_translated.xlsx",             "jp_psa",   "JP"),
    ("일본_자금결제법_시행령_translated.xlsx",      "jp_psa_enf","JP"),
    ("일본_자금이동업자_내각부령_translated.xlsx",  "jp_funds_transfer_co", "JP"),
]

ART_RES = {
    "EU": re.compile(r"^Article\s+(\d+[a-z]?)\b", re.I),  # 'Article 5', 'Article 5a'
    "EN": re.compile(r"^(\d+[A-Z]?)\."),                  # 홍콩/싱가포르/미국 'N. Heading', '5A.'
}

# 일본 조번호: 한자수사 → 아라비아.  '第六十二条の三' → '62의3' (DB article_no 형식과 일치)
_KDIG = {'〇': 0, '零': 0, '一': 1, '二': 2, '三': 3, '四': 4,
         '五': 5, '六': 6, '七': 7, '八': 8, '九': 9}
_KUNIT = {'十': 10, '百': 100, '千': 1000}
_KSET = "〇零一二三四五六七八九十百千"
JP_ART = re.compile(rf"^第([{_KSET}]+)条(?:の([{_KSET}]+))?")


def kanji_to_int(s):
    total, cur = 0, 0
    for ch in s:
        if ch in _KDIG:
            cur = _KDIG[ch]
        elif ch in _KUNIT:
            total += (cur or 1) * _KUNIT[ch]
            cur = 0
        else:
            return None
    return total + cur


def detect_article(o, parser):
    """원문 한 줄 → article_no(문자열) 또는 None."""
    if parser == "JP":
        m = JP_ART.match(o)
        if not m:
            return None
        main = kanji_to_int(m.group(1))
        if main is None:
            return None
        if m.group(2):
            sub = kanji_to_int(m.group(2))
            return f"{main}의{sub}" if sub is not None else None
        return str(main)
    m = ART_RES[parser].search(o)
    return m.group(1) if m else None


def parse_excel(fname, parser):
    """엑셀 → {article_no: 번역텍스트(누적)}.  원문 col0 으로 경계 탐지, 번역 col1 누적."""
    path = os.path.join(DATA, fname)
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))[1:]  # 헤더 스킵
    wb.close()
    arts, order, cur = {}, [], None
    for r in rows:
        o = (str(r[0]).strip() if r and r[0] is not None else "")
        k = (str(r[1]).strip() if r and len(r) > 1 and r[1] is not None else "")
        a = detect_article(o, parser) if o else None
        if a is not None:
            cur = a
            if cur not in arts:
                arts[cur] = []
                order.append(cur)
        if cur is not None and k:
            arts[cur].append(k)
    return {a: "\n".join(v).strip() for a, v in arts.items() if v}, order


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--commit", action="store_true", help="실제 UPDATE 수행(미지정 시 dry-run)")
    ap.add_argument("--only", default="", help="쉼표구분 law code 화이트리스트")
    args = ap.parse_args()
    only = set(c.strip() for c in args.only.split(",") if c.strip())

    pw = os.environ.get("FINDB_ROOT_PW")
    if not pw:
        print("ERROR: FINDB_ROOT_PW 환경변수가 필요합니다.")
        sys.exit(1)

    conn = pymysql.connect(host="localhost", user="root", password=pw,
                           database="fin_law_db", charset="utf8mb4", autocommit=False)
    cur = conn.cursor(pymysql.cursors.DictCursor)

    print(f"{'code':<22} {'엑셀art':>7} {'DBart':>6} {'매칭':>5} {'미매칭(DB)':>9}  비고")
    print("-" * 78)
    grand_updates = 0
    for fname, code, parser in JOBS:
        if only and code not in only:
            continue
        if not os.path.exists(os.path.join(DATA, fname)):
            print(f"{code:<22} (엑셀 없음: {fname})")
            continue
        xmap, _ = parse_excel(fname, parser)

        cur.execute("SELECT id FROM law WHERE code=%s", (code,))
        law = cur.fetchone()
        if not law:
            print(f"{code:<22} (DB law 없음)")
            continue
        law_id = law["id"]
        # article 별 대표 provision(ordinal 최소)
        cur.execute(
            "SELECT article_no, MIN(ordinal) AS m FROM law_provision "
            "WHERE law_id=%s AND article_no IS NOT NULL GROUP BY article_no", (law_id,))
        rep = {}
        for row in cur.fetchall():
            cur.execute(
                "SELECT id FROM law_provision WHERE law_id=%s AND article_no=%s AND ordinal=%s LIMIT 1",
                (law_id, row["article_no"], row["m"]))
            pr = cur.fetchone()
            if pr:
                rep[row["article_no"]] = pr["id"]

        matched = set(xmap) & set(rep)
        db_only = set(rep) - set(xmap)
        updates = 0
        if args.commit:
            for art in matched:
                cur.execute("UPDATE law_provision SET text_ko=%s WHERE id=%s",
                            (xmap[art], rep[art]))
                updates += cur.rowcount
            grand_updates += updates
        note = "OK" if len(matched) >= 0.8 * len(rep) else "↓매칭저조(정규식보강 필요)"
        print(f"{code:<22} {len(xmap):>7} {len(rep):>6} {len(matched):>5} {len(db_only):>9}  {note}")

    if args.commit:
        conn.commit()
        print("-" * 78)
        print(f"COMMIT 완료: text_ko {grand_updates}개 provision 갱신")
    else:
        print("-" * 78)
        print("dry-run (UPDATE 미수행). 실제 적재는 --commit")
    conn.close()


if __name__ == "__main__":
    main()
