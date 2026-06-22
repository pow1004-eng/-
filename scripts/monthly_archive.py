#!/usr/bin/env python3
"""
매월 1일 자동 실행: 전월 대시보드를 reports/YYYY-MM.html 로 아카이브하고
archive.html 카드 목록을 업데이트합니다.
"""
import re, sys, os
from datetime import date, timedelta

# ── 날짜 계산 ─────────────────────────────────────────────
def last_month(today=None):
    if today is None:
        today = date.today()
    first = today.replace(day=1)
    last  = first - timedelta(days=1)
    return last.year, last.month

# ── 경로 ──────────────────────────────────────────────────
ROOT   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC    = os.path.join(ROOT, "index.html")
ARCH   = os.path.join(ROOT, "archive.html")
REPDIR = os.path.join(ROOT, "reports")

# CLI: python monthly_archive.py 2026 6  (수동 지정 가능)
if len(sys.argv) == 3:
    year, month = int(sys.argv[1]), int(sys.argv[2])
else:
    year, month = last_month()

yearmonth = f"{year}-{month:02d}"
label_kr  = f"{year}년 {month:02d}월"
dest      = os.path.join(REPDIR, f"{yearmonth}.html")

os.makedirs(REPDIR, exist_ok=True)

# ── index.html 읽기 ───────────────────────────────────────
with open(SRC, encoding="utf-8") as f:
    html = f.read()

# ── 아카이브 배너 CSS 삽입 ─────────────────────────────────
BANNER_CSS = """
/* Archive banner */
.arch-bar{background:#FEF3C7;border-bottom:2px solid #FCD34D;padding:8px 22px;
  display:flex;align-items:center;justify-content:space-between;flex-shrink:0;font-size:13px}
.arch-bar b{color:#D97706;font-weight:700}
.arch-bar a{color:#D97706;font-weight:700;text-decoration:none}
.arch-bar a:hover{text-decoration:underline}
"""
html = html.replace("</style>", BANNER_CSS + "</style>", 1)

# ── 타이틀 변경 ───────────────────────────────────────────
html = re.sub(
    r"<title>.*?</title>",
    f"<title>퍼시스 · {label_kr} 신제품 리포트 (아카이브)</title>",
    html, count=1
)

# ── 아카이브 배너 HTML 삽입 (topbar 바로 다음) ─────────────
BANNER_HTML = (
    f'\n  <div class="arch-bar">'
    f'<b>📦 {label_kr} 아카이브 — 읽기 전용</b>'
    f'<a href="../index.html">최신 리포트 보기 →</a>'
    f'</div>'
)
# </div> 다음에 오는 첫 번째 <div class="cnt" 앞에 삽입
html = re.sub(
    r'(<!-- BRANDS DIRECTORY VIEW -->)',
    BANNER_HTML + r'\n  \1',
    html, count=1
)

# ── archive.html 링크들을 상대경로 수정 ────────────────────
# archive.html → ../archive.html
html = html.replace('href="archive.html"', 'href="../archive.html"')

# ── 파일 저장 ─────────────────────────────────────────────
with open(dest, "w", encoding="utf-8") as f:
    f.write(html)
print(f"[OK] {dest} 생성 완료")

# ── archive.html 업데이트 ─────────────────────────────────
with open(ARCH, encoding="utf-8") as f:
    arch = f.read()

# 이미 같은 달 카드가 있으면 건너뜀
if f'"reports/{yearmonth}.html"' in arch:
    print(f"[SKIP] archive.html 에 {label_kr} 이미 존재")
    sys.exit(0)

NEW_CARD = (
    f'\n    <a href="reports/{yearmonth}.html" class="card">'
    f'\n      <span class="badge badge-arch">아카이브</span>'
    f'\n      <div class="month">{label_kr}</div>'
    f'\n      <div class="meta">40개 브랜드 · 글로벌 신제품 모니터링</div>'
    f'\n      <div class="arrow">→</div>'
    f'\n    </a>'
)

MARKER = '<div class="grid" id="archive-grid">'
idx = arch.find(MARKER)
if idx == -1:
    print("[WARN] archive.html에 archive-grid 마커를 찾지 못했습니다")
    sys.exit(1)

insert_pos = idx + len(MARKER)
arch = arch[:insert_pos] + NEW_CARD + arch[insert_pos:]

with open(ARCH, "w", encoding="utf-8") as f:
    f.write(arch)
print(f"[OK] archive.html 업데이트 완료 — {label_kr} 카드 추가")
