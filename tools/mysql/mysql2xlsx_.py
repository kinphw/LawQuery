# 250702 v0.1.0
# MySQL 데이터베이스 테이블을 Excel 파일로 추출하는 스크립트

import pandas as pd
import pymysql
from dotenv import load_dotenv
import os
from datetime import datetime

# 0️⃣ .env 파일 로드
load_dotenv('../../.env')

# 1️⃣ 설정: 데이터베이스 & 테이블 이름
DB_NAME = 'ldb_i'  # 데이터베이스 이름 (변경 가능)
TABLE_NAME = "db_i"  # 추출할 테이블 이름 (변경 가능)

# 출력 파일 경로 (날짜 포함)
date_str = datetime.now().strftime('%y%m%d')
output_path = f"data/{TABLE_NAME}_{date_str}.xlsx"

# 선택: 로컬 or 운영
USE_PROD = False  # True로 바꾸면 운영 DB 연결

# 2️⃣ MySQL 연결 (pymysql 사용)
print(f"🔌 MySQL 연결 중... (DB: {DB_NAME}, Table: {TABLE_NAME})")

if USE_PROD:
    conn = pymysql.connect(
        host=os.getenv('PROD_MYSQL_HOST'),
        port=int(os.getenv('PROD_MYSQL_PORT')),
        user=os.getenv('PROD_MYSQL_USER'),
        password=os.getenv('PROD_MYSQL_PASSWORD'),
        database=DB_NAME,
        charset='utf8mb4'
    )
else:
    conn = pymysql.connect(
        host=os.getenv('MYSQL_HOST'),
        port=int(os.getenv('MYSQL_PORT')),
        user=os.getenv('MYSQL_USER'),
        password=os.getenv('MYSQL_PASSWORD'),
        database=DB_NAME,
        charset='utf8mb4'
    )

cursor = conn.cursor()

# 3️⃣ 테이블 존재 여부 확인
cursor.execute(f"SHOW TABLES LIKE '{TABLE_NAME}'")
result = cursor.fetchone()

if not result:
    print(f"❌ 테이블 `{TABLE_NAME}`이 존재하지 않습니다.")
    conn.close()
    exit(1)

print(f"✅ 테이블 `{TABLE_NAME}` 확인 완료")

# 4️⃣ 테이블 데이터 읽기
query = f"SELECT * FROM `{TABLE_NAME}`"
print(f"📊 데이터 조회 중...")

df = pd.read_sql(query, conn)
print(f"✅ 데이터 로딩 완료: {df.shape[0]} rows, {df.shape[1]} columns")

# 5️⃣ Excel 파일로 저장
print(f"💾 Excel 파일로 저장 중... ({output_path})")

# Excel 엔진 사용 (openpyxl)
df.to_excel(output_path, index=False, engine='openpyxl')

print(f"🎉 Excel 파일 저장 완료: {output_path}")
print(f"   - 행: {df.shape[0]}")
print(f"   - 열: {df.shape[1]}")

# 6️⃣ 연결 종료
cursor.close()
conn.close()
print("✅ MySQL 연결 종료")
