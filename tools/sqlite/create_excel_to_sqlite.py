"""
Excel to SQLite Converter
------------------------
Excel 파일의 모든 시트를 SQLite 데이터베이스의 개별 테이블로 변환하는 스크립트

작성자: kinphw
작성일: 2025-03-02
버전: 0.0.2
"""

import pandas as pd
import sqlite3

# 1️⃣ 엑셀 파일 읽기 (파일명 수정 가능)
excel_file = "data/db_i.xlsx"  # 변환할 Excel 파일 경로

# 2️⃣ SQLite 데이터베이스 생성
db_file = excel_file.rsplit('.', 1)[0] + '.db' # Excel 파일명과 동일한 SQLite 파일명
conn = sqlite3.connect(db_file)
cursor = conn.cursor()

# 3️⃣ Excel 파일의 모든 시트 읽기
excel = pd.ExcelFile(excel_file)
sheet_names = excel.sheet_names

# 4️⃣ 각 시트를 개별 테이블로 변환
for sheet_name in sheet_names:
    # 시트 데이터를 데이터프레임으로 읽기
    df = pd.read_excel(excel, sheet_name=sheet_name)
    
    # 테이블명으로 사용할 시트 이름 정제 (특수문자 제거 및 공백을 언더스코어로 변환)
    table_name = "".join(c if c.isalnum() else "_" for c in sheet_name)
    
    # 기존 테이블이 있다면 삭제
    cursor.execute(f"DROP TABLE IF EXISTS {table_name}")
    
    # 데이터프레임을 SQL 테이블로 변환
    df.to_sql(table_name, conn, if_exists="replace", index=False)
    
    print(f"✓ 시트 '{sheet_name}' → 테이블 '{table_name}' 변환 완료")

# 5️⃣ 저장 및 닫기
conn.commit()
conn.close()
excel.close()

print(f"✅ 모든 시트 변환 완료: {db_file}")
