# 250406 v0.0.1
# 엑셀 파일을 MySQL 데이터베이스에 업로드하는 스크립트

import pandas as pd
from sqlalchemy import create_engine
from dotenv import load_dotenv
import os
import tkinter as tk
from tkinter import filedialog

# .env 파일 로드
load_dotenv('../../.env')

MYSQL_DB = 'ldb_y' # 하드코딩

# MySQL 연결 엔진 생성 (환경변수 사용)
#db_url = f"mysql+pymysql://{os.getenv('MYSQL_USER')}:{os.getenv('MYSQL_PASSWORD')}@{os.getenv('MYSQL_HOST')}:{os.getenv('MYSQL_PORT')}/{os.getenv('MYSQL_DB')}?charset=utf8mb4"
db_url = f"mysql+pymysql://{os.getenv('MYSQL_USER')}:{os.getenv('MYSQL_PASSWORD')}@{os.getenv('MYSQL_HOST')}:{os.getenv('MYSQL_PORT')}/{MYSQL_DB}?charset=utf8mb4"
engine = create_engine(db_url)

# 엑셀 파일 선택 다이얼로그
root = tk.Tk()
root.withdraw()
excel_path = filedialog.askopenfilename(
    title="업로드할 엑셀 파일을 선택하세요",
    filetypes=[("Excel files", "*.xlsx *.xls")],
    initialdir=os.getcwd()  # 현재 작업 디렉토리에서 시작
)

if not excel_path:
    print("❌ 엑셀 파일을 선택하지 않았습니다.")
    exit()

# 모든 시트 읽기
sheets = pd.read_excel(excel_path, sheet_name=None)

# 모든 시트를 반복하여 MySQL 테이블로 저장
for sheet_name, df in sheets.items():
    table_name = sheet_name.strip().lower().replace(" ", "_")  # 테이블 이름 정리
    print(f"▶ 업로드 중: 시트 '{sheet_name}' → 테이블 '{table_name}'")

    # _x000D_를 \n으로 되살리기 (또는 없애기)
    for col in df.select_dtypes(include=['object']).columns:
        df[col] = df[col].str.replace('_x000D_', '', regex=False)

    df.to_sql(name=table_name, con=engine, index=False, if_exists="replace")

print("✅ 모든 시트가 MySQL 테이블로 업로드되었습니다!")
