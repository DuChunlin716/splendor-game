#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成一份中文研究报告示例 PDF（用于演示金融研究助手的 PDF 阅读能力）。

用法:
    python make_sample_report.py [输出路径]

依赖:
    需要 reportlab（安装在 .dsh/tools/gen_libs 目录）。
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / ".dsh" / "tools" / "gen_libs"))

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

FONTS = {
    "heiti": "C:/Windows/Fonts/simhei.ttf",   # 黑体（标题）
    "fangsong": "C:/Windows/Fonts/simfang.ttf",  # 仿宋（正文）
    "kaiti": "C:/Windows/Fonts/simkai.ttf",   # 楷体（强调）
}

for name, path in FONTS.items():
    if Path(path).is_file():
        pdfmetrics.registerFont(TTFont(name, path))
    else:
        print(f"[警告] 字体不存在: {path}", file=sys.stderr)

HEI = "heiti" if Path(FONTS["heiti"]).is_file() else "Helvetica"
FANG = "fangsong" if Path(FONTS["fangsong"]).is_file() else "Helvetica"
KAI = "kaiti" if Path(FONTS["kaiti"]).is_file() else "Helvetica"

TITLE = ParagraphStyle("title", fontName=HEI, fontSize=20, leading=28, alignment=1, spaceAfter=6)
META = ParagraphStyle("meta", fontName=FANG, fontSize=10, leading=16, alignment=1, textColor=colors.HexColor("#555555"), spaceAfter=18)
H2 = ParagraphStyle("h2", fontName=HEI, fontSize=15, leading=22, spaceBefore=14, spaceAfter=8, textColor=colors.HexColor("#1a1a1a"))
H3 = ParagraphStyle("h3", fontName=HEI, fontSize=12, leading=18, spaceBefore=10, spaceAfter=6)
BODY = ParagraphStyle("body", fontName=FANG, fontSize=11, leading=20, firstLineIndent=22, spaceAfter=6)
NOTE = ParagraphStyle("note", fontName=KAI, fontSize=10, leading=16, textColor=colors.HexColor("#444444"))


def build_story() -> list:
    story = []

    story.append(Paragraph("2025 年中国宏观经济展望与银行业影响分析", TITLE))
    story.append(Paragraph("某证券研究所 ｜ 2025 年 1 月 ｜ 首席分析师：张某某", META))

    story.append(Paragraph("摘要", H2))
    story.append(Paragraph(
        "展望 2025 年，中国经济在内需修复与外部不确定性交织下运行。我们预计全年 GDP 增速约为 4.8%，"
        "节奏上呈现\u201c前低后稳\u201d特征。货币政策延续宽松基调，全年仍有 1-2 次降准空间，LPR 有望再下调"
        "20-30 个基点。财政政策更加积极，赤字率或提升至 3.5%。对银行业而言，净息差仍面临收窄压力，"
        "但存款利率下调与负债成本改善将部分对冲；资产质量总体稳定，零售与对公不良生成率可控。"
        "我们维持银行业\u201c增持\u201d评级，推荐高股息与财富管理两条主线。", BODY))

    story.append(Paragraph("一、宏观经济：内需修复与政策加力", H2))
    story.append(Paragraph("1.1 增长：投资企稳，消费温和复苏", H3))
    story.append(Paragraph(
        "2025 年固定资产投资增速预计回升至 4.5% 左右，其中基建投资在专项债扩容支持下保持 8% 以上的较高增速；"
        "制造业投资受设备更新政策拉动维持在 9% 附近。社会消费品零售总额增速预计回升至 5.5%，服务消费贡献提升，"
        "但居民资产负债表修复仍需时间，消费复苏斜率偏缓。", BODY))
    story.append(Paragraph("1.2 通胀：温和回升，中枢上移", H3))
    story.append(Paragraph(
        "我们预计 2025 年 CPI 同比中枢回升至 1.2% 左右，猪肉价格周期上行与服务业价格修复为主要支撑；"
        "PPI 同比降幅收窄至 -0.5% 附近，工业品价格在产能去化与出口韧性下逐步企稳。"
        "通胀温和回升有利于企业盈利修复与名义 GDP 增速改善。", BODY))
    story.append(Paragraph("1.3 政策：货币宽松，财政积极", H3))
    story.append(Paragraph(
        "货币政策方面，预计 2025 年实施 1-2 次降准（合计 50-100 个基点），政策利率（7 天逆回购）下调 20-30 个基点，"
        "LPR 1 年期与 5 年期同步下调。结构性工具继续发力，科技创新与绿色再贷款规模扩大。财政政策方面，"
        "赤字率或提升至 3.5%，新增专项债额度 4.5 万亿元，超长期特别国债继续发行 1 万亿元，重点支持"
        "\u201c两重\u201d\u201c两新\u201d领域。", BODY))

    story.append(PageBreak())
    story.append(Paragraph("二、银行业务影响分析", H2))
    story.append(Paragraph("2.1 净息差：收窄趋势延续，负债成本改善对冲", H3))
    story.append(Paragraph(
        "2024 年行业净息差已降至 1.5% 左右的历史低位。2025 年资产端 LPR 下调将带动贷款重定价，"
        "预计全年净息差仍有 10-15 个基点的下行压力。但存款利率自律机制下，国有大行与股份行 2024 年"
        "已多轮下调存款挂牌利率，2025 年负债端成本改善幅度预计可达 8-12 个基点，部分对冲资产端压力。"
        "我们预计 2025 年上市银行净息差降幅收窄至 6-10 个基点。", BODY))
    story.append(Paragraph("2.2 资产质量：总体稳定，关注零售与地产尾部风险", H3))
    story.append(Paragraph(
        "截至 2024 年三季度，商业银行不良贷款率为 1.56%，拨备覆盖率 209.5%，安全垫充足。2025 年重点关注"
        "三个方向：一是房地产白名单项目融资落地效果，涉房不良生成率有望边际改善；二是居民消费贷与经营贷"
        "逾期率随收入修复而企稳；三是地方政府化债推进下，城投平台贷款风险缓释，但需关注非标与表外敞口。"
        "我们预计全年行业不良率维持在 1.5%-1.6% 区间。", BODY))
    story.append(Paragraph("2.3 信贷投放：总量平稳，结构优化", H3))
    story.append(Paragraph(
        "2025 年新增人民币贷款预计 22 万亿元左右，增速约 7.5%。结构上，制造业中长期贷款、绿色贷款、"
        "普惠小微贷款保持双位数增长；按揭贷款受地产销售低位影响增量有限。信贷结构优化有利于银行提升"
        "风险定价能力，改善综合收益率。", BODY))
    story.append(Paragraph("2.4 中间业务与财富管理：复苏可期", H3))
    story.append(Paragraph(
        "2024 年受降费让利与市场波动影响，行业手续费净收入承压。2025 年随着资本市场活跃度回升与保险、"
        "理财代销回暖，预计中间业务收入增速回正至 3%-5%。财富管理业务向\u201c买方投顾\u201d转型加速，"
        "高净值客户综合服务成为竞争焦点。", BODY))

    story.append(Paragraph("三、主要数据表", H2))
    rows = [
        ["指标", "2023 年实际", "2024 年预测", "2025 年预测"],
        ["GDP 增速", "5.2%", "4.9%", "4.8%"],
        ["CPI 同比", "0.2%", "0.5%", "1.2%"],
        ["PPI 同比", "-3.0%", "-2.2%", "-0.5%"],
        ["社融存量增速", "9.5%", "8.2%", "8.5%"],
        ["新增人民币贷款", "22.7 万亿", "21.5 万亿", "22.0 万亿"],
        ["商业银行净息差", "1.69%", "1.50%", "1.43%"],
        ["商业银行不良率", "1.59%", "1.56%", "1.55%"],
    ]
    table = Table(rows, colWidths=[50 * mm, 38 * mm, 38 * mm, 38 * mm])
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), HEI),
        ("FONTNAME", (0, 1), (-1, -1), FANG),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8e8e8")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#999999")),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(table)
    story.append(Spacer(1, 6 * mm))

    story.append(Paragraph("四、风险提示", H2))
    story.append(Paragraph(
        "1）地产销售与投资修复不及预期，涉房资产质量恶化超预期；2）外部贸易摩擦升级，出口链信贷需求走弱；"
        "3）存款成本改善不及预期，净息差下行超预期；4）资本市场波动导致财富管理业务收入低于预期。", BODY))

    return story


def main() -> None:
    default_out = Path(__file__).resolve().parent / "2025宏观展望与银行业影响分析_示例报告.pdf"
    out_path = Path(sys.argv[1]) if len(sys.argv) > 1 else default_out
    out_path.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=A4,
        leftMargin=22 * mm, rightMargin=22 * mm,
        topMargin=22 * mm, bottomMargin=22 * mm,
        title="2025年中国宏观经济展望与银行业影响分析",
        author="某证券研究所",
    )
    doc.build(build_story())
    print(f"已生成示例 PDF: {out_path.resolve()}")


if __name__ == "__main__":
    main()
