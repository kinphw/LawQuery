# 250630 v0.2.0
# 피클(Pickle) 파일을 MySQL 데이터베이스에 안전하게 업로드하는 스크립트 (pymysql 버전)

import pandas as pd
import pymysql
from sqlalchemy import create_engine
from dotenv import load_dotenv
import os

# 0️⃣ .env 파일 로드
load_dotenv('../../.env')
DB_NAME = 'ldb_i'  # 하드코딩된 데이터베이스 이름 (변경 가능)

# 1️⃣ 설정: 파일 경로 & 테이블 이름
pickle_path = "data/db_i_250630.pkl"
table_name = "db_i"  # 하드코딩된 테이블 이름 (변경 가능)

# 선택: 로컬 or 운영
USE_PROD = True  # True로 바꾸면 운영 DB 연결

# 2️⃣ 데이터프레임 불러오기
df = pd.read_pickle(pickle_path)
print(f"✅ DataFrame 로딩 완료: {df.shape[0]} rows, {df.shape[1]} columns")

# 3️⃣ 컬럼명 정제
df.columns = [col.strip().replace(" ", "_").lower() for col in df.columns]

# 4️⃣ MySQL 연결 (pymysql 사용)
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

# 5️⃣ 테이블 존재 여부 확인 후 없을 경우 생성
cursor.execute(f"SHOW TABLES LIKE '{table_name}'")
result = cursor.fetchone()

if not result:
    print(f"ℹ️ 테이블 `{table_name}`이 존재하지 않아 생성합니다.")

    # dtype → MySQL 타입 매핑 함수
    def map_dtype(dtype):
        if pd.api.types.is_integer_dtype(dtype):
            return "INT"
        elif pd.api.types.is_float_dtype(dtype):
            return "FLOAT"
        elif pd.api.types.is_bool_dtype(dtype):
            return "BOOLEAN"
        elif pd.api.types.is_datetime64_any_dtype(dtype):
            return "DATETIME"
        else:
            return "TEXT"

    columns_sql = []
    for col in df.columns:
        sql_type = map_dtype(df[col].dtype)
        columns_sql.append(f"`{col}` {sql_type}")

    create_table_sql = f"""
    CREATE TABLE `{table_name}` (
        {', '.join(columns_sql)}
    ) CHARACTER SET utf8mb4;
    """

    cursor.execute(create_table_sql)
    conn.commit()
    print(f"🛠️ 테이블 생성 완료: `{table_name}`")
else:
    print(f"✅ 테이블 `{table_name}`이 이미 존재합니다. 삭제 없이 유지합니다.")

# 6️⃣ 데이터 업로드: INSERT IGNORE 유지
def insert_ignore(table_name, df, conn):
    cursor = conn.cursor()

    columns = ', '.join([f"`{col}`" for col in df.columns])
    placeholders = ', '.join(['%s'] * len(df.columns))

    insert_sql = f"""
    INSERT IGNORE INTO `{table_name}` ({columns})
    VALUES ({placeholders})
    """

    total_rows = len(df)
    inserted_rows = 0

    for _, row in df.iterrows():
        cursor.execute(insert_sql, tuple(row))
        inserted_rows += cursor.rowcount

    conn.commit()
    print(f"🎉 전체 건: {total_rows} rows, 중복 제외 후 삽입된 건: {inserted_rows} rows")

# id 컬럼 삭제 (DB의 AUTO_INCREMENT에 맡긴다)
if 'id' in df.columns:
    df = df.drop(columns=['id'])

# 중복 무시하고 데이터 삽입
insert_ignore(table_name, df, conn)

print("🎉 데이터 업로드 완료!")
