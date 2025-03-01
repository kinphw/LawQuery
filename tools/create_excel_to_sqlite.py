"""
Excel to SQLite Converter
------------------------
Excel 파일을 (존재하지 않는) SQLite 데이터베이스로 변환하는 스크립트

작성자: kinphw
작성일: 2025-03-01
버전: 0.0.1
"""

import pandas as pd
import sqlite3

# 1️⃣ 엑셀 파일 읽기 (파일명 수정 가능)
excel_file = "data/db_i.xlsx"  # 변환할 Excel 파일 경로
df = pd.read_excel(excel_file, sheet_name=0)  # 첫 번째 시트 읽기

# 2️⃣ SQLite 데이터베이스 생성
db_file = "data/dataset.db"
conn = sqlite3.connect(db_file)
cursor = conn.cursor()

# 3️⃣ 테이블 생성 (기존 테이블 삭제 후 새로 생성)
table_name = excel_file.split('/')[-1].split('.')[0]  # 파일 경로에서 확장자를 제외한 파일명 추출
cursor.execute(f"DROP TABLE IF EXISTS {table_name}")  # 기존 테이블이 있다면 삭제
columns = ", ".join([f"{col} TEXT" for col in df.columns])
cursor.execute(f"CREATE TABLE {table_name} ({columns})")

# 4️⃣ 데이터 삽입
df.to_sql(table_name, conn, if_exists="replace", index=False)

# 5️⃣ 저장 및 닫기
conn.commit()
conn.close()

print(f"✅ 변환 완료: {db_file}")
