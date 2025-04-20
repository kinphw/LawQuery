# 250420 v0.0.1
# 피클(Pickle) 파일을 MySQL 데이터베이스에 업로드하는 스크립트

import pandas as pd
import mysql.connector
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import os


# 0️⃣ .env 파일 로드
load_dotenv('../../.env')


# 1️⃣ 설정: 파일 경로 & 테이블 이름
pickle_path = "data/db_i.pkl"
table_name = "db_i" # 하드코딩된 테이블 이름 (변경 가능)

# 2️⃣ 데이터프레임 불러오기
df = pd.read_pickle(pickle_path)
print(f"✅ DataFrame 로딩 완료: {df.shape[0]} rows, {df.shape[1]} columns")

# 3️⃣ dtype → MySQL 타입 매핑 함수
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

# 4️⃣ CREATE TABLE 구문 생성
columns_sql = []
for col in df.columns:
    col_clean = col.strip().replace(" ", "_").lower()
    sql_type = map_dtype(df[col].dtype)
    columns_sql.append(f"`{col_clean}` {sql_type}")

create_table_sql = f"""
CREATE TABLE IF NOT EXISTS `{table_name}` (
    {', '.join(columns_sql)}
) CHARACTER SET utf8mb4;
"""

# 5️⃣ MySQL 연결
conn = mysql.connector.connect(
    host=os.getenv('MYSQL_HOST'),
    user=os.getenv('MYSQL_USER'),
    password=os.getenv('MYSQL_PASSWORD'),
    database=os.getenv('MYSQL_DB')
)
cursor = conn.cursor()

# 6️⃣ 기존 테이블 제거 후 생성
cursor.execute(f"DROP TABLE IF EXISTS `{table_name}`")
cursor.execute(create_table_sql)
conn.commit()
print(f"🛠️ 테이블 생성 완료: `{table_name}`")

# 7️⃣ SQLAlchemy로 데이터 업로드
db_url = f"mysql+pymysql://{os.getenv('MYSQL_USER')}:{os.getenv('MYSQL_PASSWORD')}@{os.getenv('MYSQL_HOST')}:{os.getenv('MYSQL_PORT')}/{os.getenv('MYSQL_DB')}?charset=utf8mb4"
engine = create_engine(db_url)
df.columns = [col.strip().replace(" ", "_").lower() for col in df.columns]  # 컬럼명 정제
df.to_sql(name=table_name, con=engine, index=False, if_exists="append")

print("🎉 데이터 업로드 완료!")
