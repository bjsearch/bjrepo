"""
PDF 파일 압축 및 최적화 유틸리티.

대용량 PDF 파일을 압축해서 처리 성능을 개선한다.
"""
import os
import subprocess
from pathlib import Path


def compress_pdf_with_ghostscript(input_path: str, output_path: str, quality: str = "ebook") -> bool:
    """Ghostscript를 사용해서 PDF를 압축한다 (가장 효과적: 50-80% 축소)."""
    try:
        cmd = [
            "gs",
            "-sDEVICE=pdfwrite",
            f"-dPDFSETTINGS=/{quality}",
            "-dNOPAUSE",
            "-dQUIET",
            "-dBATCH",
            "-dDetectDuplicateImages",
            "-r150x150",
            f"-sOutputFile={output_path}",
            input_path,
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=120)
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired, Exception):
        return False


def compress_pdf_with_pypdf(input_path: str, output_path: str) -> bool:
    """PyPDF2를 사용해서 PDF를 압축한다 (효과: 10-30% 축소)."""
    try:
        from PyPDF2 import PdfReader, PdfWriter

        reader = PdfReader(input_path)
        writer = PdfWriter()

        # 모든 페이지를 압축하며 복사
        for page in reader.pages:
            page.compress_content_streams()
            writer.add_page(page)

        with open(output_path, "wb") as f:
            writer.write(f)
        return True
    except Exception:
        return False


def compress_pdf(input_path: str, output_path: str, quality: str = "ebook") -> tuple[bool, str]:
    """
    PDF를 압축한다. Ghostscript를 먼저 시도하고, 없으면 PyPDF2를 사용한다.

    Returns:
        (성공 여부, 방법)
    """
    # 1. Ghostscript 시도 (가장 효과적)
    if compress_pdf_with_ghostscript(input_path, output_path, quality):
        return True, "ghostscript"

    # 2. PyPDF2 폴백
    if compress_pdf_with_pypdf(input_path, output_path):
        return True, "pypdf2"

    return False, "none"


def get_compression_ratio(original_size: int, compressed_size: int) -> float:
    """압축률을 계산한다 (0.0 ~ 1.0, 낮을수록 압축 잘됨)."""
    if original_size == 0:
        return 0.0
    return compressed_size / original_size


def should_compress(file_size: int, threshold_mb: int = 10) -> bool:
    """파일 압축이 필요한지 판단한다."""
    return file_size > threshold_mb * 1024 * 1024
