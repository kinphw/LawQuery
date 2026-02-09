# 251218 v0.1.0
# MySQL 테이블을 엑셀 파일로 추출하는 스크립트

import pandas as pd
from sqlalchemy import create_engine
from dotenv import load_dotenv
import os
import tkinter as tk
from tkinter import filedialog, simpledialog

# 0️⃣ .env 파일 로드
load_dotenv('.env')
DB_NAME = 'ldb_y'  # 기본 데이터베이스 이름 (필요 시 변경)

# 1️⃣ 설정
# 선택: 로컬 or 운영 (기본값 설정)
USE_PROD = True  # True로 바꾸면 운영 DB 연결

# 2️⃣ MySQL 연결 엔진 생성
if USE_PROD:
    db_url = f"mysql+pymysql://{os.getenv('PROD_MYSQL_USER')}:{os.getenv('PROD_MYSQL_PASSWORD')}@{os.getenv('PROD_MYSQL_HOST')}:{os.getenv('PROD_MYSQL_PORT')}/{DB_NAME}?charset=utf8mb4"
else:
    db_url = f"mysql+pymysql://{os.getenv('MYSQL_USER')}:{os.getenv('MYSQL_PASSWORD')}@{os.getenv('MYSQL_HOST')}:{os.getenv('MYSQL_PORT')}/{DB_NAME}?charset=utf8mb4"

try:
    engine = create_engine(db_url)
    print("✅ 데이터베이스 연결 성공!")
except Exception as e:
    print(f"❌ 데이터베이스 연결 실패: {e}")
    exit()

# 3️⃣ 테이블 이름 입력 받기
root = tk.Tk()
root.withdraw()

table_name = simpledialog.askstring("테이블 선택", "추출할 테이블 이름을 입력하세요:", parent=root)

if not table_name:
    print("❌ 테이블 이름이 입력되지 않았습니다.")
    exit()

print(f"▶ 테이블 '{table_name}' 데이터 조회 중...")

# 4️⃣ 데이터 조회
try:
    query = f"SELECT * FROM `{table_name}`"
    df = pd.read_sql(query, con=engine)
    print(f"✅ 데이터 조회 완료: {df.shape[0]} rows, {df.shape[1]} columns")
except Exception as e:
    print(f"❌ 데이터 조회 실패 (테이블 이름을 확인하세요): {e}")
    exit()

if df.empty:
    print("⚠️ 조회된 데이터가 없습니다.")
    exit()

# 5️⃣ 저장할 파일 경로 선택
save_path = filedialog.asksaveasfilename(
    title="엑셀 파일로 저장",
    defaultextension=".xlsx",
    filetypes=[("Excel files", "*.xlsx")],
    initialfile=f"{table_name}.xlsx",
    initialdir=os.getcwd()
)

if not save_path:
    print("❌ 파일 저장이 취소되었습니다.")
    exit()

# 6️⃣ 엑셀 파일로 저장
try:
    df.to_excel(save_path, index=False)
    print(f"🎉 엑셀 파일 저장 완료: {save_path}")
except Exception as e:
    print(f"❌ 파일 저장 실패: {e}")
