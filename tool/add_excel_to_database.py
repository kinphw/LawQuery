import pandas as pd
import sqlite3

# 1️⃣ 기존 데이터베이스 파일 경로 설정
db_file = "data/dataset.db"  # 기존 데이터베이스 파일 경로

# 2️⃣ 새로운 엑셀 파일 읽기
new_excel_file = "data/db_i.xlsx"  # 추가할 새로운 Excel 파일 경로
df = pd.read_excel(new_excel_file, sheet_name=0)  # 첫 번째 시트 읽기

# 3️⃣ 기존 데이터베이스에 연결
conn = sqlite3.connect(db_file)
cursor = conn.cursor()

# 4️⃣ 새로운 테이블 생성 (컬럼명 자동 설정)
table_name = new_excel_file.split('/')[-1].split('.')[0]  # 파일명을 테이블명으로 사용
cursor.execute(f"DROP TABLE IF EXISTS {table_name}")  # 기존 테이블이 있다면 삭제
columns = ", ".join([f"{col} TEXT" for col in df.columns])
cursor.execute(f"CREATE TABLE IF NOT EXISTS {table_name} ({columns})")

# 5️⃣ 데이터 삽입
df.to_sql(table_name, conn, if_exists="replace", index=False)

# 6️⃣ 저장 및 닫기
conn.commit()
conn.close()

print(f"✅ 새로운 테이블 추가 완료: {table_name}")
print(f"📁 데이터베이스 파일 위치: {db_file}")
