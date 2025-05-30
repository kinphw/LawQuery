"""
xls2Json2js.py
------------------------
Excel 파일을 JSON으로 변환하여 JavaScript 파일로 저장하는 스크립트  
* 현재는 SQLite DB를 사용하도록 대체하여 미사용

작성자: kinphw
작성일: 2025-03-01
버전: 0.0.1
"""


import pandas as pd
import json

def convert_excel_to_json(excel_file):
    # 첫 번째 시트 읽기
    df = pd.read_excel(excel_file, sheet_name=0, dtype=str)
    
    # DataFrame을 JSON 문자열로 변환
    json_str = df.to_json(orient="records", force_ascii=False, indent=4)
    return json_str

def save_to_js(json_str, js_file):
    # data.js 파일로 저장
    with open(js_file, "w", encoding="utf-8") as f:
        f.write("var dataset = ")
        f.write(json_str)
    
    print(f"JS 파일이 저장되었습니다: {js_file}")

if __name__ == "__main__":
    excel_file = "data/dataset.xlsx"
    js_file = "data/dataset.js"

    json_str = convert_excel_to_json(excel_file)
    save_to_js(json_str, js_file)
