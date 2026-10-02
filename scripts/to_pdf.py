"""원문 파일(HWP·HWPX·DOC·DOCX) → PDF 한 건 변환. 기관 보도자료 원문 보기(`press/services/PressOriginalService.ts`)가 부른다.

AcctQuery `scripts/to_pdf.py` 와 같은 파일이다(고칠 땐 양쪽을 함께). 방식은 disputeM(`native/dmhelper.cs` ToPdf)·
sentinelact `tools/convert_hwp3.py` 와 같다:
이 PC의 한/글(HWPFrame.HwpObject)·워드(Word.Application)를 COM 으로 **새 인스턴스**로 띄워 PDF 로 저장한다.

사용자 프로그램 보호(convert_hwp3.py 와 같은 규칙):
  - 실제 COM 호출은 자식 프로세스(--worker)에서만 한다. DispatchEx 는 실행 중인 인스턴스를 재사용하지 않는다.
  - 실행 전/후 한/글·워드 PID 집합을 비교해 "이번에 새로 생긴" 프로세스만 정리한다 — 사용자가 띄워 둔 창은 건드리지 않는다.
  - 원본은 읽기 전용으로 연다(한/글 lock:false, 워드 ReadOnly). 원본 경로에 저장하는 코드는 없다.
  - 파워포인트는 단일 인스턴스라 사용자 창에 붙을 수 있어 다루지 않는다.

출력: 성공이면 종료코드 0 과 dst 파일. 실패면 0 이 아닌 종료코드와 stderr 에 사유 한 줄.

    python scripts/to_pdf.py <src> <dst> [--timeout 120]
"""
from __future__ import annotations

import argparse
import os
import pathlib
import subprocess
import sys

OFFICE_PROCESS_NAMES = {"hwp.exe", "hwpframe.exe", "winword.exe"}
HWP_EXT = {".hwp", ".hwpx"}
WORD_EXT = {".doc", ".docx"}


def _office_pids() -> set[int]:
    import psutil

    return {p.info["pid"] for p in psutil.process_iter(["name", "pid"])
            if (p.info.get("name") or "").lower() in OFFICE_PROCESS_NAMES}


def _kill_new(before: set[int]) -> list[int]:
    """before 에 없던(이번에 새로 뜬) 한/글·워드 중 COM 자동화 인스턴스만 강제 종료한다.

    COM 으로 띄운 인스턴스는 명령줄에 -Automation / -Embedding 이 붙는다(실측: hwp.exe -Automation -Embedding).
    변환하는 몇 초 사이에 사용자가 직접 연 한/글·워드 창은 이 표시가 없어 건드리지 않는다(일괄 변환이 몇 시간 돈다).
    """
    import psutil

    killed: list[int] = []
    for pid in _office_pids() - before:
        try:
            proc = psutil.Process(pid)
            cmd = " ".join(proc.cmdline()).lower()
            if "automation" not in cmd and "embedding" not in cmd:
                continue
            for child in proc.children(recursive=True):
                try:
                    child.kill()
                except psutil.Error:
                    pass
            proc.kill()
            killed.append(pid)
        except psutil.Error:
            pass
    return killed


def convert(src: pathlib.Path, dst: pathlib.Path, timeout: int) -> int:
    before = _office_pids()
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(".part.pdf")
    if tmp.exists():
        tmp.unlink()
    args = [sys.executable, str(pathlib.Path(__file__).resolve()), "--worker", str(src), str(tmp)]
    try:
        proc = subprocess.run(args, capture_output=True, timeout=timeout,
                              env={**os.environ, "PYTHONIOENCODING": "utf-8"})
    except subprocess.TimeoutExpired:
        killed = _kill_new(before)
        sys.stderr.write(f"시간 초과({timeout}초) — 변환 프로그램 응답 없음(정리한 PID {killed})")
        return 9
    _kill_new(before)  # 워커가 Quit 하지 못하고 남긴 인스턴스 방어선
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", errors="replace").strip()
        sys.stderr.write(err[-400:] if err else f"워커 종료코드 {proc.returncode}")
        return proc.returncode or 1
    if not tmp.exists() or tmp.stat().st_size == 0:
        sys.stderr.write("저장은 성공을 반환했지만 PDF 파일이 없음")
        return 5
    os.replace(tmp, dst)  # 다 쓴 파일만 캐시 이름으로 — 반쯤 쓴 PDF 를 내보내지 않는다
    return 0


def _worker_hwp(src: str, dst: str) -> int:
    import win32com.client

    hwp = None
    try:
        hwp = win32com.client.DispatchEx("HWPFrame.HwpObject")
        for step in (lambda: hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule"),
                     lambda: hwp.SetMessageBoxMode(0x10000),
                     lambda: setattr(hwp.XHwpWindows.Item(0), "Visible", False)):
            try:
                step()
            except Exception:
                pass
        if not hwp.Open(src, "", "forceopen:true;versionwarning:false;lock:false"):
            sys.stderr.write("한/글이 파일을 열지 못함(손상 파일이거나 지원하지 않는 형식)")
            return 3
        ok = hwp.SaveAs(dst, "PDF", "")
        try:
            hwp.XHwpDocuments.Item(0).SetModified(False)
            hwp.Run("FileClose")
        except Exception:
            pass
        if not ok:
            sys.stderr.write("한/글 PDF 저장이 실패를 반환함")
            return 4
        return 0
    finally:
        if hwp is not None:
            try:
                hwp.SetMessageBoxMode(0xF0000)
            except Exception:
                pass
            try:
                hwp.Quit()  # 숨긴 한/글은 Quit 하지 않으면 프로세스가 남는다(disputeM 실측)
            except Exception:
                pass


def _worker_word(src: str, dst: str) -> int:
    import win32com.client

    word = None
    doc = None
    try:
        word = win32com.client.DispatchEx("Word.Application")
        word.Visible = False
        word.DisplayAlerts = 0
        # Open(FileName, ConfirmConversions, ReadOnly, AddToRecentFiles, PasswordDocument) — 암호 문서는 가짜 암호로 바로 실패시킨다
        doc = word.Documents.Open(src, False, True, False, "__aq_no_password__")
        doc.ExportAsFixedFormat(dst, 17)  # wdExportFormatPDF
        return 0
    finally:
        if doc is not None:
            try:
                doc.Close(0)
            except Exception:
                pass
        if word is not None:
            try:
                word.Quit(0)
            except Exception:
                pass


def worker(src: str, dst: str) -> int:
    import pythoncom

    pythoncom.CoInitialize()
    try:
        ext = pathlib.Path(src).suffix.lower()
        src_full = str(pathlib.Path(src).resolve())
        dst_full = str(pathlib.Path(dst).resolve())
        if ext in HWP_EXT:
            return _worker_hwp(src_full, dst_full)
        if ext in WORD_EXT:
            return _worker_word(src_full, dst_full)
        sys.stderr.write(f"변환하지 않는 형식 {ext}")
        return 2
    except Exception as exc:  # noqa: BLE001 — COM 예외는 사유 한 줄로 남긴다
        sys.stderr.write(f"COM 예외: {exc}")
        return 6
    finally:
        try:
            pythoncom.CoUninitialize()
        except Exception:
            pass


def main() -> int:
    if len(sys.argv) >= 4 and sys.argv[1] == "--worker":
        return worker(sys.argv[2], sys.argv[3])
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--timeout", type=int, default=120)
    a = ap.parse_args()
    return convert(pathlib.Path(a.src), pathlib.Path(a.dst), a.timeout)


if __name__ == "__main__":
    sys.exit(main())
