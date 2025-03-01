import base64

# SQLite .db 파일 경로
db_file = "data/dataset.db"
output_js = "data/dataset.js"

# SQLite DB 파일을 Base64로 변환
with open(db_file, "rb") as f:
    encoded = base64.b64encode(f.read()).decode("utf-8")

# JavaScript 파일 내용 구성 (Base64 + 복호화 함수 포함)
js_content = f'''var databaseBase64 = "{encoded}";

// Base64를 바이너리로 변환하여 Uint8Array 반환
function getDatabaseBinary() {{
    const binaryString = atob(databaseBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {{
        bytes[i] = binaryString.charCodeAt(i);
    }}
    return bytes;
}}
'''

# JavaScript 파일로 저장
with open(output_js, "w") as f:
    f.write(js_content)

print(f"✅ 변환 완료! {output_js} 파일이 생성되었습니다.")
