"""Тихий порог — холст визуальной системы. Рендер: python design/render.py"""
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
FONTS = Path(r"C:/Users/kzask/.claude/skills/synced/bf7e0a6d-6e73-4705-8753-7ef107064a70_e6e27f15-1d0d-4a31-ae75-95f75d933d57/canvas-design/canvas-fonts")
ONEST = HERE / "fonts" / "Onest.ttf"

W, H, S = 3600, 2400, 3  # итоговый размер и суперсэмплинг

PAPER = (243, 240, 233)
PAPER2 = (233, 229, 219)
SURFACE = (252, 251, 248)
INK = (21, 23, 28)
GRAPHITE = (96, 99, 108)
MIST = (196, 192, 183)
HAIR = (218, 214, 205)
COBALT = (38, 66, 230)
COBALT_SOFT = (226, 230, 250)
VERMILION = (216, 74, 46)

img = Image.new("RGB", (W * S, H * S), PAPER)
d = ImageDraw.Draw(img)


def s(v):
    return round(v * S)


def onest(size, wght):
    f = ImageFont.truetype(str(ONEST), s(size))
    f.set_variation_by_axes([wght])
    return f


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), s(size))


MONO = lambda z: font("GeistMono-Regular.ttf", z)
MONO_B = lambda z: font("GeistMono-Bold.ttf", z)


def rect(x0, y0, x1, y1, r=0, fill=None, outline=None, width=1):
    d.rounded_rectangle([s(x0), s(y0), s(x1), s(y1)], radius=s(r), fill=fill,
                        outline=outline, width=s(width) if outline else 0)


def circle(cx, cy, r, fill=None, outline=None, width=1):
    d.ellipse([s(cx - r), s(cy - r), s(cx + r), s(cy + r)], fill=fill,
              outline=outline, width=s(width) if outline else 0)


def line(x0, y0, x1, y1, fill=HAIR, width=1):
    d.line([s(x0), s(y0), s(x1), s(y1)], fill=fill, width=max(1, s(width)))


def text(x, y, t, f, fill=INK, anchor="la", spacing=0):
    """spacing — трекинг в итоговых px между буквами."""
    if not spacing:
        d.text((s(x), s(y)), t, font=f, fill=fill, anchor=anchor)
        return
    total = sum(f.getlength(c) for c in t) + s(spacing) * (len(t) - 1)
    cx = s(x)
    if anchor[0] == "r":
        cx -= total
    elif anchor[0] == "m":
        cx -= total / 2
    for c in t:
        d.text((cx, s(y)), c, font=f, fill=fill, anchor="l" + anchor[1])
        cx += f.getlength(c) + s(spacing)


def tlen(t, f, spacing=0):
    return (f.getlength(t) + s(spacing) * (len(t) - 1)) / S


# ─── Сетка композиции ────────────────────────────────────────────────
M = 150                 # поле листа
TOP, BOT = 330, 1470    # верх/низ главной зоны
FIELD_X, N = M, 41
THRESH_X = 1465
SCR_X0, SCR_X1 = 1620, W - M
MOD = (round((SCR_X1 - SCR_X0) * 10 / 16) + 28) / N  # высота поля = высота корпуса экрана
LOW = 1690              # нижняя зона
FOOT = 2250

# ─── Шапка ───────────────────────────────────────────────────────────
cap = MONO(22)
text(M, 196, "ФИГ. 01", cap, INK, "ls", 4)
text(M + 150, 196, "ВИЗУАЛЬНАЯ СИСТЕМА — БЮРО ПРОПУСКОВ", cap, GRAPHITE, "ls", 4)
text(W - M, 196, "ТИХИЙ ПОРОГ · 2026", cap, GRAPHITE, "rs", 4)
line(M, 238, W - M, 238, MIST, 1.2)

# ─── Поле кода: модули растворяются при переходе порога ──────────────
rng = random.Random(12)
grid = [[rng.random() < 0.47 for _ in range(N)] for _ in range(N)]


def finder(r0, c0):
    for r in range(-1, 8):
        for c in range(-1, 8):
            rr, cc = r0 + r, c0 + c
            if 0 <= rr < N and 0 <= cc < N:
                ring = max(abs(r - 3), abs(c - 3))
                grid[rr][cc] = ring in (0, 1, 3) if 0 <= r < 7 and 0 <= c < 7 else False


for r0, c0 in ((0, 0), (0, N - 7), (N - 7, 0)):
    finder(r0, c0)
for i in range(8, N - 8):
    grid[6][i] = grid[i][6] = i % 2 == 0
for r in range(N - 9, N - 4):  # выравнивающий узор
    for c in range(N - 9, N - 4):
        ring = max(abs(r - (N - 7)), abs(c - (N - 7)))
        grid[r][c] = ring != 1

DISSOLVE = 25   # с этого столбца квадраты становятся точками
field_y = TOP - 14
gap = 2.2
for r in range(N):
    for c in range(N):
        x = FIELD_X + c * MOD
        y = field_y + r * MOD
        cx, cy = x + MOD / 2, y + MOD / 2
        in_tr = r < 7 and c >= N - 7
        if grid[r][c]:
            color = COBALT if in_tr else INK
            if c < DISSOLVE:
                rect(x + gap / 2, y + gap / 2, x + MOD - gap / 2, y + MOD - gap / 2, 2.5, fill=color)
            else:
                t = (c - DISSOLVE) / (N - 1 - DISSOLVE)
                rad = (MOD / 2 - gap / 2) * (1 - 0.62 * t)
                if in_tr:
                    rad = MOD / 2 - gap / 2
                circle(cx, cy, rad, fill=color)
        else:
            circle(cx, cy, 1.5, fill=MIST)

# одна красная искра — след печати
circle(FIELD_X + 33 * MOD + MOD / 2, field_y + 22 * MOD + MOD / 2, MOD / 2 - 3, fill=VERMILION)
grid[22][33] = True

# координатные метки вокруг поля
tick = MONO(15)
fy1 = field_y + N * MOD
for c in (0, 10, 20, 30, 40):
    x = FIELD_X + c * MOD + MOD / 2
    line(x, fy1 + 36, x, fy1 + 52, GRAPHITE, 1.2)
    text(x, fy1 + 88, f"{c:02d}", tick, GRAPHITE, "ms")
text(FIELD_X + DISSOLVE * MOD, field_y - 22, "↓ переход", MONO(16), GRAPHITE, "ls", 1)
line(FIELD_X + DISSOLVE * MOD, field_y - 12, FIELD_X + DISSOLVE * MOD, field_y - 2, GRAPHITE, 1.2)

# ─── Порог: линия перфорации ─────────────────────────────────────────
py = TOP - 20
while py <= 2100:
    circle(THRESH_X, py, 4.2, fill=MIST)
    py += 22
for yy in (TOP - 52, 2132):
    d.pieslice([s(THRESH_X - 16), s(yy - 16), s(THRESH_X + 16), s(yy + 16)], 0, 360, fill=PAPER2)

# ─── Экран регистрации ───────────────────────────────────────────────
SX0, SY0, SX1 = SCR_X0, TOP, SCR_X1
SY1 = SY0 + round((SX1 - SX0) * 10 / 16)
rect(SX0 - 14, SY0 - 14, SX1 + 14, SY1 + 14, 38, fill=INK)          # корпус моноблока
rect(SX0, SY0, SX1, SY1, 24, fill=PAPER)

# навигация
NAV_H = 104
nx, ny = SX0 + 44, SY0 + NAV_H / 2
rect(nx, ny - 24, nx + 48, ny + 24, 13, fill=COBALT)
rect(nx + 15, ny - 9, nx + 33, ny + 9, 3, outline=SURFACE, width=3)
text(nx + 70, ny, "Бюро пропусков", onest(27, 560), INK, "lm")
tabs = [("Регистрация", True), ("Журнал", False), ("Справочники", False)]
tf = onest(24, 480)
tx = nx + 370
for label, active in tabs:
    w = tlen(label, tf) + 56
    if active:
        rect(tx, ny - 30, tx + w, ny + 30, 30, fill=INK)
    text(tx + w / 2, ny, label, tf, SURFACE if active else GRAPHITE, "mm")
    tx += w + 12
# сканер, часы, пользователь
rx = SX1 - 44
circle(rx - 26, ny, 26, fill=PAPER2)
text(rx - 26, ny, "АК", onest(19, 600), INK, "mm")
text(rx - 80, ny, "14:32", font("GeistMono-Regular.ttf", 34), INK, "rm")
cw = tlen("14:32", MONO(34))
sx_ = rx - 80 - cw - 36
sl = "Сканер QR готов"
sw = tlen(sl, onest(20, 480)) + 64
rect(sx_ - sw, ny - 24, sx_, ny + 24, 24, fill=COBALT_SOFT)
circle(sx_ - sw + 26, ny, 6, fill=COBALT)
text(sx_ - sw + 44, ny, sl, onest(20, 500), COBALT, "lm")
line(SX0, SY0 + NAV_H, SX1, SY0 + NAV_H, HAIR, 1.4)

# карточка формы
CX0, CY0 = SX0 + 44, SY0 + NAV_H + 40
CX1, CY1 = SX0 + 1130, SY1 - 44
rect(CX0, CY0, CX1, CY1, 26, fill=SURFACE)
px = CX0 + 52
text(px, CY0 + 88, "Новый пропуск", onest(46, 600), INK, "ls")
text(CX1 - 52, CY0 + 88, "№ 000 417", MONO(22), GRAPHITE, "rs", 1)

# сегменты типа посетителя
segy = CY0 + 124
rect(px, segy, CX1 - 52, segy + 68, 20, fill=PAPER)
segs = ["Физ. лицо", "Юр. лицо", "Гос. орган"]
seg_w = (CX1 - 52 - px - 12) / 3
for i, lab in enumerate(segs):
    x0 = px + 6 + i * seg_w
    if i == 0:
        rect(x0, segy + 6, x0 + seg_w, segy + 62, 15, fill=SURFACE, outline=HAIR, width=1.4)
    text(x0 + seg_w / 2, segy + 34, lab, onest(23, 560 if i == 0 else 460), INK if i == 0 else GRAPHITE, "mm")

lab_f, val_f = onest(19, 520), onest(27, 440)


def field(x0, y0, x1, label, value, focus=False, chevron=False, mono=False, hint=None):
    text(x0, y0, label, lab_f, GRAPHITE, "ls")
    fy0 = y0 + 16
    rect(x0, fy0, x1, fy0 + 76, 16, fill=SURFACE,
         outline=COBALT if focus else MIST, width=2.4 if focus else 1.6)
    if focus:
        rect(x0 - 5, fy0 - 5, x1 + 5, fy0 + 81, 20, outline=COBALT_SOFT, width=4)
        rect(x0, fy0, x1, fy0 + 76, 16, outline=COBALT, width=2.4)
    f = font("GeistMono-Regular.ttf", 27) if mono else val_f
    text(x0 + 24, fy0 + 38, value, f, INK, "lm", 3 if mono else 0)
    if chevron:
        cx, cy = x1 - 36, fy0 + 38
        d.line([s(cx - 8), s(cy - 4), s(cx), s(cy + 4), s(cx + 8), s(cy - 4)], fill=GRAPHITE, width=s(2.4), joint="curve")
    if hint:
        hw = tlen(hint, onest(18, 560)) + 30
        rect(x1 - 20 - hw, fy0 + 20, x1 - 20, fy0 + 56, 18, fill=COBALT_SOFT)
        text(x1 - 20 - hw / 2, fy0 + 38, hint, onest(18, 580), COBALT, "mm")


row = 108
rgap = (CY1 - 52 - 96 - (segy + 68) - 3 * row) / 4
fy = segy + 68 + rgap + 16
half = (CX1 - 52 - px - 24) / 2
field(px, fy, CX1 - 52, "ФИО посетителя", "Сейткали Айгерим Нурлановна", focus=True)
fy += row + rgap
field(px, fy, CX1 - 52, "ИИН", "950412 400321", mono=True, hint="12 / 12")
fy += row + rgap
field(px, fy, px + half, "Управление", "Кадровой работы", chevron=True)
field(px + half + 24, fy, CX1 - 52, "Сотрудник", "Ержанов Д. К. · 214", chevron=True)

# кнопки
by0, by1 = CY1 - 52 - 96, CY1 - 52
gw = 230
rect(px, by0, px + gw, by1, 22, outline=MIST, width=1.6)
text(px + gw / 2, (by0 + by1) / 2, "Очистить", onest(25, 520), INK, "mm")
rect(px + gw + 20, by0, CX1 - 52, by1, 22, fill=COBALT)
bmid = (px + gw + 20 + CX1 - 52) / 2
bl = "Выдать пропуск"
bf = onest(28, 600)
blw = tlen(bl, bf)
text(bmid - 22, (by0 + by1) / 2, bl, bf, SURFACE, "mm")
ax = bmid - 22 + blw / 2 + 26
ay = (by0 + by1) / 2
line(ax, ay, ax + 26, ay, SURFACE, 3)
d.line([s(ax + 16), s(ay - 10), s(ax + 26), s(ay), s(ax + 16), s(ay + 10)], fill=SURFACE, width=s(3), joint="curve")

# карточка фото
PX0, PX1 = CX1 + 28, SX1 - 44
rect(PX0, CY0, PX1, CY1, 26, fill=SURFACE)
text(PX0 + 44, CY0 + 70, "Фото посетителя", onest(25, 560), INK, "ls")
fx0, fy0_, fx1 = PX0 + 44, CY0 + 104, PX1 - 44
fy1_ = fy0_ + (fx1 - fx0) * 1.08
rect(fx0, fy0_, fx1, fy1_, 20, fill=PAPER)
fcx = (fx0 + fx1) / 2
circle(fcx, fy0_ + (fy1_ - fy0_) * 0.40, (fx1 - fx0) * 0.17, fill=PAPER2)
d.chord([s(fcx - (fx1 - fx0) * 0.36), s(fy0_ + (fy1_ - fy0_) * 0.66),
         s(fcx + (fx1 - fx0) * 0.36), s(fy0_ + (fy1_ - fy0_) * 1.26)], 180, 360, fill=PAPER2)
bl_ = 34
for (x, y, dx, dy) in ((fx0 + 26, fy0_ + 26, 1, 1), (fx1 - 26, fy0_ + 26, -1, 1),
                       (fx0 + 26, fy1_ - 26, 1, -1), (fx1 - 26, fy1_ - 26, -1, -1)):
    line(x, y, x + dx * bl_, y, INK, 3)
    line(x, y, x, y + dy * bl_, INK, 3)
# затвор
shy = fy1_ + (CY1 - fy1_) / 2 - 18
circle(fcx, shy, 40, outline=INK, width=2.4)
circle(fcx, shy, 30, fill=INK)
text(fcx, CY1 - 40, "Время  14:32:07", MONO(19), GRAPHITE, "ms", 1)

# линейка 12 колонок под экраном
ry = SY1 + 14 + 30
colw = (SX1 - SX0) / 12
for i in range(13):
    x = SX0 + i * colw
    line(x, ry - 8, x, ry + 8, GRAPHITE, 1.2)
line(SX0, ry, SX1, ry, MIST, 1.2)
for i in range(12):
    text(SX0 + i * colw + colw / 2, ry + 44, f"{i + 1:02d}", tick, GRAPHITE, "ms")

# ─── Нижняя зона: знак и фраза ───────────────────────────────────────
wm = onest(250, 200)
text(M - 12, LOW + 178, "Допуск", wm, INK, "ls")
dot_x = M - 12 + tlen("Допуск", wm) + 26
circle(dot_x, LOW + 178 - 22, 22, fill=VERMILION)
text(M, LOW + 304, "Порог, который проходят спокойно.", font("Lora-Italic.ttf", 50), GRAPHITE, "ls")
text(M, LOW + 378, "СИСТЕМА ЦИФРОВОЙ ВЫДАЧИ ПРОПУСКОВ", MONO(18), GRAPHITE, "ls", 4)

# ─── Палитра ─────────────────────────────────────────────────────────
swatches = [("Бумага", PAPER, "#F3F0E9"), ("Поверхность", SURFACE, "#FCFBF8"),
            ("Графит", INK, "#15171C"), ("Туман", MIST, "#C4C0B7"),
            ("Кобальт", COBALT, "#2642E6"), ("Киноварь", VERMILION, "#D84A2E")]
sw_w, sw_g = 150, 30
sy0, sy1 = LOW, LOW + 260
for i, (name, col, hx) in enumerate(swatches):
    x0 = SCR_X0 + i * (sw_w + sw_g)
    rect(x0, sy0, x0 + sw_w, sy1, 18, fill=col, outline=MIST if col in (PAPER, SURFACE) else None, width=1.4)
    text(x0, sy1 + 44, name, onest(22, 560), INK, "ls")
    text(x0, sy1 + 76, hx, MONO(17), GRAPHITE, "ls", 1)
# пропорции использования цвета
bar_y = sy1 + 118
bar_x1 = SCR_X0 + 6 * sw_w + 5 * sw_g
parts = [(PAPER2, 46), (SURFACE, 24), (INK, 18), (MIST, 7), (COBALT, 4.2), (VERMILION, 0.8)]
bx = SCR_X0
tot = sum(p for _, p in parts)
for col, p in parts:
    w = (bar_x1 - SCR_X0) * p / tot
    rect(bx, bar_y, bx + w, bar_y + 10, 0, fill=col)
    bx += w
text(SCR_X0, bar_y + 48, "ДОЛЯ ЦВЕТА В ИНТЕРФЕЙСЕ", MONO(15), GRAPHITE, "ls", 3)

# ─── Шрифты ──────────────────────────────────────────────────────────
TX = 2860
text(TX, LOW + 178, "Аа", onest(250, 300), INK, "ls")
text(TX + 330, LOW + 44, "Onest", onest(40, 560), INK, "ls")
text(TX + 330, LOW + 82, "интерфейс · 300–600", onest(21, 440), GRAPHITE, "ls")
text(TX + 330, LOW + 142, "Geist Mono", MONO(32), INK, "ls")
text(TX + 330, LOW + 178, "данные · номера · время", onest(21, 440), GRAPHITE, "ls")
text(TX, LOW + 260, "0123456789", MONO(40), INK, "ls", 6)
text(TX, LOW + 304, "ТОЧНОСТЬ ЦИФР", MONO(15), GRAPHITE, "ls", 3)

# ─── Подвал ──────────────────────────────────────────────────────────
line(M, FOOT - 70, W - M, FOOT - 70, MIST, 1.2)
foot = MONO(17)
text(M, FOOT, "МОДУЛЬ 8 PX · РАДИУС 16/24 · КАСАНИЕ ≥ 72 PX · 12 КОЛОНОК", foot, GRAPHITE, "ls", 3)
text(W - M, FOOT, "ЛИСТ 01 / 01", foot, GRAPHITE, "rs", 3)

out = img.resize((W, H), Image.LANCZOS)
out.save(HERE / "tihiy-porog.png", optimize=True)
print("ok", out.size)
