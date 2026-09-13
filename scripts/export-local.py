"""
로컬판 데이터 추출 — MySQL(ldb_*) → SQLite(dist-local/db/*.sqlite)

호스팅이 메인이고 로컬판은 그 부산물이다. 이 스크립트 하나로 최신 데이터가 담긴
배포본을 언제든 다시 뽑을 수 있어야 한다(손으로 덤프하기 시작하면 배포본이 낡는다).

  python scripts/export-local.py            # 국내법령 전부 + 유권해석
  python scripts/export-local.py --offline  # 위 + file:// 용 base64 임베딩(.js) 동시 생성

산출물:
  dist-local/db/ldb_<code>.sqlite  각 법령 (SqlJsDbContext.getInstance('ldb_j') 와 파일명 직결)
  dist-local/db/ldb_i.sqlite       유권해석
  dist-local/db/ldb_auth.sqlite    law_registry (법령 레지스트리 = 프론트 드롭다운 단일 출처)
  dist-local/db/manifest.json      파일 목록·크기·행수 (로더가 읽음)

주의: 해외법령(fin_law_db)은 로컬판에서 제외한다. 넣으려면 PLAN 에 한 줄 추가하면 되고,
      54.5MB 늘어난다(성능은 실측상 여유).
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sqlite3
import sys
import time

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

try:
    import pymysql
except ImportError:
    sys.exit("pymysql 이 필요합니다:  pip install pymysql")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'dist-local', 'db')

# 추출 대상: (MySQL DB명, 포함할 테이블 집합 or None=전부)
# ldb_auth 는 law_registry 만 — 회원·비밀번호 해시 등은 절대 로컬판에 넣지 않는다.
PLAN: list[tuple[str, set[str] | None]] = [
    ('ldb_j', None), ('ldb_y', None), ('ldb_s', None), ('ldb_c', None), ('ldb_g', None),
    ('ldb_t', None), ('ldb_v', None), ('ldb_x', None), ('ldb_z', None),
    ('ldb_i', None),
    ('ldb_auth', {'law_registry'}),
]


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    path = os.path.join(ROOT, '.env')
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip()
    return env


def connect(env: dict[str, str], db: str):
    return pymysql.connect(
        host=env.get('MYSQL_HOST', 'localhost'),
        port=int(env.get('MYSQL_PORT', '3306')),
        user=env['MYSQL_USER'],
        password=env['MYSQL_PASSWORD'],
        database=db,
        charset='utf8mb4',
    )


def export_db(env: dict[str, str], db_name: str, only: set[str] | None) -> dict:
    """MySQL 스키마 하나를 SQLite 파일 하나로. 테이블명은 원본 그대로 유지한다
    (Model 의 SQL 을 한 글자도 고치지 않기 위한 전제)."""
    out_path = os.path.join(OUT_DIR, f'{db_name}.sqlite')
    if os.path.exists(out_path):
        os.remove(out_path)

    conn = connect(env, db_name)
    cur = conn.cursor()
    cur.execute('SHOW TABLES')
    tables = [r[0] for r in cur.fetchall()]
    if only is not None:
        tables = [t for t in tables if t in only]

    lite = sqlite3.connect(out_path)
    lite.execute('PRAGMA journal_mode=OFF')
    lite.execute('PRAGMA synchronous=OFF')

    total_rows = 0
    for table in tables:
        cur.execute(f'SHOW COLUMNS FROM `{table}`')
        cols = [r[0] for r in cur.fetchall()]
        col_sql = ', '.join(f'"{c}"' for c in cols)
        lite.execute(f'CREATE TABLE "{table}" ({col_sql})')

        cur.execute(f'SELECT {", ".join(f"`{c}`" for c in cols)} FROM `{table}`')
        holders = ','.join('?' * len(cols))
        while True:
            rows = cur.fetchmany(2000)
            if not rows:
                break
            # datetime/date → 문자열 (mysql2 의 dateStrings:true 와 동일한 취급)
            rows = [tuple(str(v) if hasattr(v, 'isoformat') else v for v in row) for row in rows]
            lite.executemany(f'INSERT INTO "{table}" VALUES ({holders})', rows)
            total_rows += len(rows)

    conn.close()
    lite.commit()
    lite.execute('VACUUM')
    lite.close()

    return {
        'db': db_name,
        'file': f'{db_name}.sqlite',
        'bytes': os.path.getsize(out_path),
        'tables': len(tables),
        'rows': total_rows,
    }


def make_offline_bundle(entries: list[dict], stamp: str) -> None:
    """file:// 배포용 — fetch 가 차단되므로 SQLite 를 base64 로 <script> 에 실어 나른다.
    (2025-03 최초 버전이 쓰던 기법. 팽창률 1.33배.)

    ★ 페이지별로 나눠 담는다. 법령 화면을 여는데 유권해석 30MB 까지 읽을 이유가 없다.
      offline-law.js    국내법령 9개 + law_registry  → index.html
      offline-interp.js 유권해석                     → interpretation.html
    """
    # 배포 폴더(db/)가 아니라 별도 캐시에 만든다. http 배포본에 섞이면 같은 데이터가 두 벌이 되고,
    # 빌드가 그것을 지우면 재빌드 때 다시 추출해야 하는 악순환이 생긴다.
    cache_dir = os.path.join(ROOT, 'dist-local', '_offline')
    os.makedirs(cache_dir, exist_ok=True)
    groups = {
        'offline-law.js': [e for e in entries if e['db'] != 'ldb_i'],
        'offline-interp.js': [e for e in entries if e['db'] == 'ldb_i'],
    }
    for name, group in groups.items():
        if not group:
            continue
        js_path = os.path.join(cache_dir, name)
        with open(js_path, 'w', encoding='utf-8') as out:
            out.write('// 자동 생성 - scripts/export-local.py --offline\n')
            # 페이지마다 다른 파일을 싣되 같은 객체에 누적한다(둘 다 실려도 안전).
            out.write('window.LQ_OFFLINE_DB = window.LQ_OFFLINE_DB || {};\n')
            # file:// 에서는 manifest.json 을 읽을 수 없으므로 기준일을 여기에 심는다.
            out.write('window.LQ_OFFLINE_STAMP = "' + stamp + '";' + chr(10))
            for e in group:
                src = os.path.join(OUT_DIR, e['file'])
                with open(src, 'rb') as f:
                    b64 = base64.b64encode(f.read()).decode('ascii')
                out.write(f'window.LQ_OFFLINE_DB["{e["db"]}"] = "{b64}";\n')
        print(f'  {name:<18} {os.path.getsize(js_path)/1048576:8.1f} MB  (base64 임베딩)')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--offline', action='store_true',
                    help='file:// 배포용 base64 임베딩(.js) 도 함께 생성')
    args = ap.parse_args()

    env = load_env()
    os.makedirs(OUT_DIR, exist_ok=True)

    print(f'추출 시작 → {OUT_DIR}')
    started = time.time()
    entries = []
    for db_name, only in PLAN:
        t0 = time.time()
        try:
            entry = export_db(env, db_name, only)
        except pymysql.err.OperationalError as exc:
            print(f'  {db_name:<12} 건너뜀 ({exc.args[-1]})')
            continue
        entries.append(entry)
        print(f'  {db_name:<12} {entry["bytes"]/1048576:8.2f} MB  '
              f'테이블 {entry["tables"]:>2}  행 {entry["rows"]:>6}  {time.time()-t0:.1f}s')

    manifest = {
        'generated_at': time.strftime('%Y-%m-%d %H:%M:%S'),
        'databases': entries,
        'total_bytes': sum(e['bytes'] for e in entries),
    }
    with open(os.path.join(OUT_DIR, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    if args.offline:
        make_offline_bundle(entries, manifest['generated_at'])

    total_mb = manifest['total_bytes'] / 1048576
    print(f'\n완료 — {len(entries)}개 DB, 합계 {total_mb:.1f} MB, {time.time()-started:.1f}s')


if __name__ == '__main__':
    main()
