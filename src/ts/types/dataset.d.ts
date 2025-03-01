declare global {
    interface Window {
        Dataset: any;
    }
}

class Dataset {
    getDatabaseBinary(): Uint8Array {
        return new Uint8Array(); // 기본값 반환 (실제 JS 파일에서 데이터 로드됨)
    }
}
