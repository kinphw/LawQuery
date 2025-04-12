# 250406 v0.0.1
# 엑셀 파일을 MySQL 데이터베이스에 업로드하는 스크립트

import pandas as pd
from sqlalchemy import create_engine

# MySQL 연결 엔진 생성
engine = create_engine("mysql+pymysql://ldbuser:1226@localhost:3306/ldb?charset=utf8mb4")

# 엑셀 파일 경로
excel_path = "data/db_aesr.xlsx"

# 모든 시트 읽기
sheets = pd.read_excel(excel_path, sheet_name=None)

# 모든 시트를 반복하여 MySQL 테이블로 저장
for sheet_name, df in sheets.items():
    table_name = sheet_name.strip().lower().replace(" ", "_")  # 테이블 이름 정리
    print(f"▶ 업로드 중: 시트 '{sheet_name}' → 테이블 '{table_name}'")
    df.to_sql(name=table_name, con=engine, index=False, if_exists="replace")

print("✅ 모든 시트가 MySQL 테이블로 업로드되었습니다!")
