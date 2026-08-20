#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
金融研究助手 · PDF 研究报告文本提取器
====================================
把 PDF 研究报告（含中文）逐页提取为纯文本，供模型阅读、总结与分析。

用法:
    python pdf_extract.py --input <PDF路径> [选项]

选项:
    --input PATH     必填。PDF 文件路径（支持中文路径）
    --pages "1-5,7"  可选。页码范围，例如 "1-3,5,7-9"（默认提取全部页）
    --max-pages N    可选。最多提取前 N 页（用于快速预览）
    --output PATH    可选。把全文写入该文本文件（UTF-8）。
                     强烈建议使用：把提取结果写入 .txt 后用 read 工具阅读，
                     避免命令行输出编码问题。
    --list           可选。只输出文档信息（页数、文件名），不提取正文。

输出格式:
    每个提取页之间用 "===== 第 N 页 / 共 M 页 =====" 分隔，便于模型定位引用。

依赖:
    优先使用技能包自带的 libs/ 目录中的 pypdf；其次尝试系统环境。
    若两者都不可用，会打印安装指引后退出。
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# 输出编码：统一以 UTF-8 输出，避免 Windows 控制台 GBK/UTF-8 混用导致乱码
# ---------------------------------------------------------------------------
def _reconfigure_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):  # 某些环境下不可 reconfigure
            pass


def _load_pypdf():
    """按优先级加载 pypdf：技能包 libs/ → 系统环境。"""
    here = Path(__file__).resolve().parent
    candidates = [
        here.parent / "libs",          # 技能包自带依赖（推荐）
        here.parents[1] / "tools" / "pdf_libs",  # 兼容旧布局
    ]
    for cand in candidates:
        if (cand / "pypdf").is_dir():
            sys.path.insert(0, str(cand))
            try:
                import pypdf  # type: ignore
                return pypdf
            except ImportError:
                sys.path.pop(0)
    try:
        import pypdf  # type: ignore
        return pypdf
    except ImportError:
        return None


def _die(message: str) -> None:
    print(f"[错误] {message}", file=sys.stderr)
    sys.exit(1)


def parse_pages(spec: str, total: int) -> list[int]:
    """解析页码范围字符串，如 '1-3,5,7-9' → 升序页号列表（1 起）。"""
    pages: set[int] = set()
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            start, end = int(a.strip()), int(b.strip())
            if start > end:
                start, end = end, start
            pages.update(range(start, end + 1))
        else:
            pages.add(int(part))
    return sorted(p for p in pages if 1 <= p <= total)


def main() -> None:
    _reconfigure_stdio()

    parser = argparse.ArgumentParser(
        prog="pdf_extract",
        description="提取 PDF 研究报告文本（支持中文）。",
    )
    parser.add_argument("--input", required=True, help="PDF 文件路径")
    parser.add_argument("--pages", default=None, help="页码范围，如 '1-3,5'")
    parser.add_argument("--max-pages", type=int, default=None, help="最多提取前 N 页")
    parser.add_argument("--output", default=None, help="输出文本文件路径（UTF-8）")
    parser.add_argument("--list", action="store_true", help="只列出文档信息")
    args = parser.parse_args()

    src = Path(args.input)
    if not src.is_file():
        _die(f"文件不存在: {src}")

    pypdf = _load_pypdf()
    if pypdf is None:
        _die(
            "未找到 pypdf 库。请先安装依赖：\n"
            '  python -m pip install --target "<技能包目录>/libs" pypdf\n'
            "然后重试。"
        )

    try:
        reader = pypdf.PdfReader(str(src))
    except Exception as exc:  # 非 PDF 或损坏文件
        _die(f"无法解析 PDF（可能不是有效的 PDF 文件）: {exc}")

    total = len(reader.pages)
    if total == 0:
        _die("该 PDF 不含任何页面。")

    if args.list:
        print(f"文件名: {src.name}")
        print(f"路径: {src.resolve()}")
        print(f"总页数: {total}")
        return

    wanted = parse_pages(args.pages, total) if args.pages else list(range(1, total + 1))
    if args.max_pages is not None and args.max_pages > 0:
        wanted = wanted[: args.max_pages]

    out_lines: list[str] = [
        f"# 文档: {src.name}",
        f"# 总页数: {total}",
        f"# 提取页: {wanted[0]}-{wanted[-1]}" if len(wanted) > 1 else f"# 提取页: {wanted[0]}",
        f"# 来源: {src.resolve()}",
    ]

    for page_no in wanted:
        page = reader.pages[page_no - 1]
        try:
            raw = page.extract_text() or ""
        except Exception as exc:  # 单页提取失败不应中断整体
            raw = f"[第 {page_no} 页提取失败: {exc}]"
        text = "\n".join(line.rstrip() for line in raw.splitlines() if line.strip())
        out_lines.append(f"\n===== 第 {page_no} 页 / 共 {total} 页 =====")
        if text:
            out_lines.append(text)
        else:
            out_lines.append("[本页无文本层：可能是扫描件或图片型 PDF，无法直接提取文字]")

    body = "\n".join(out_lines)

    if args.output:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(body, encoding="utf-8")
        print(f"提取完成：共 {total} 页，本次提取 {len(wanted)} 页，{len(body)} 字符")
        print(f"已写入: {out_path.resolve()}")
    else:
        print(body)


if __name__ == "__main__":
    main()
