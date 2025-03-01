import pandas as pd
import sqlite3

# 1️⃣ 엑셀 파일 읽기 (파일명 수정 가능)
excel_file = "data.xlsx"  # 변환할 Excel 파일 경로
df = pd.read_excel(excel_file, sheet_name=0)  # 첫 번째 시트 읽기

# 2️⃣ SQLite 데이터베이스 생성
db_file = "database.db"  # 저장할 SQLite 파일명
conn = sqlite3.connect(db_file)
cursor = conn.cursor()

# 3️⃣ 테이블 생성 (컬럼명 자동 설정)
table_name = "my_data"
columns = ", ".join([f"{col} TEXT" for col in df.columns])
cursor.execute(f"CREATE TABLE IF NOT EXISTS {table_name} ({columns})")

# 4️⃣ 데이터 삽입
df.to_sql(table_name, conn, if_exists="replace", index=False)

# 5️⃣ 저장 및 닫기
conn.commit()
conn.close()

print(f"✅ 변환 완료: {db_file}")
