"""
add_excel_to_database.py
------------------------
Excel 파일의 모든 시트를 이미 존재하는 SQLite 데이터베이스에 추가하는 스크립트

작성자: kinphw
작성일: 2025-03-02
버전: 0.0.2
"""

import pandas as pd
import sqlite3

# 1️⃣ 기존 데이터베이스 파일 경로 설정
db_file = "data/dataset.db"  # 기존 데이터베이스 파일 경로

# 2️⃣ 새로운 엑셀 파일 읽기
new_excel_file = "data/db_i.xlsx"  # 추가할 새로운 Excel 파일 경로

# 3️⃣ 기존 데이터베이스에 연결
conn = sqlite3.connect(db_file)
cursor = conn.cursor()

# 4️⃣ Excel 파일의 모든 시트 읽기
excel = pd.ExcelFile(new_excel_file)
sheet_names = excel.sheet_names

# 5️⃣ 각 시트를 개별 테이블로 변환하여 추가
for sheet_name in sheet_names:
    # 시트 데이터를 데이터프레임으로 읽기
    df = pd.read_excel(excel, sheet_name=sheet_name)
    
    # 테이블명으로 사용할 시트 이름 정제 (특수문자 제거 및 공백을 언더스코어로 변환)
    table_name = "".join(c if c.isalnum() else "_" for c in sheet_name)
    
    # 테이블 생성 및 데이터 삽입
    df.to_sql(table_name, conn, if_exists="replace", index=False)
    
    print(f"✓ 시트 '{sheet_name}' → 테이블 '{table_name}' 추가 완료")

# 6️⃣ 저장 및 닫기
conn.commit()
conn.close()
excel.close()

print(f"✅ 모든 시트 추가 완료")
print(f"📁 데이터베이스 파일 위치: {db_file}")
