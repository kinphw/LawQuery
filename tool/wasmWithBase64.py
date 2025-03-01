"""
wasmWithBase64.py
------------------------
WASM 파일을 Base64로 변환하여 JavaScript 파일로 저장하는 스크립트

작성자: kinphw
작성일: 2025-03-01
버전: 0.0.1
"""


import base64
import os

# 입력/출력 경로 설정(원하는 경로로 수정)
WASM_INPUT_PATH = "test/sql-wasm.wasm"
JS_OUTPUT_PATH = "test/sql-wasm-b64.js"

def main():
    # 1) sql-wasm.wasm 파일을 이진 모드로 읽음
    with open(WASM_INPUT_PATH, "rb") as f:
        wasm_data = f.read()

    # 2) base64로 인코딩
    encoded_str = base64.b64encode(wasm_data).decode('utf-8')

    # 3) JS 파일 생성
    with open(JS_OUTPUT_PATH, "w", encoding="utf-8") as js_out:
        js_out.write("// sql-wasm-b64.js\n\n")
        js_out.write("// 아래 문자열에 실제 base64로 인코딩된 sql-wasm.wasm 내용을 넣습니다.\n")
        js_out.write("// (이 파일은 파이썬 스크립트로 자동생성됩니다.)\n\n")
        js_out.write("window.WASM_BASE64 = `\n")
        js_out.write(encoded_str)
        js_out.write("\n`;")

    print(f"완료: {WASM_INPUT_PATH} -> {JS_OUTPUT_PATH}")

if __name__ == "__main__":
    main()
