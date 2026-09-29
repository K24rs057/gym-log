"""ジムのメモ(data/raw_memo.txt)を、アプリに読み込ませる JSON に整形する。

使い方: python tools/import_memo.py
出力:   data/gym-log-import.json  ... アプリの「読み込む」で入れるファイル
        data/import_review.md      ... 判断がつかなかった行の一覧(確認用)
"""
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
YEAR = 2026

# 種目マスタ: id, 正規名, 部位, 増量の刻み(kg), 目標回数
MASTER = [
    ("bench-press", "ベンチプレス", "胸", 2.5, 10),
    ("bench-press-smith", "ベンチプレス(スミス)", "胸", 2.5, 10),
    ("chest-press", "チェストプレス", "胸", 2.5, 10),
    ("pec-fly", "ペックフライ", "胸", 2.5, 10),
    ("incline-smith", "インクライン(スミス)", "胸", 2.5, 10),
    ("incline-bench-press", "インクラインベンチプレス", "胸", 2.5, 10),
    ("incline-chest-press", "インクラインチェストプレス", "胸", 2.5, 10),
    ("lat-pulldown", "ラッドプルダウン", "背中", 2.5, 10),
    ("pulldown-machine", "プルダウン(マシン)", "背中", 2.5, 10),
    ("row", "ロー", "背中", 2.5, 10),
    ("pull-up", "懸垂", "背中", 2.5, 10),
    ("shoulder-press", "ショルダープレス", "肩", 2, 10),
    ("shoulder-press-machine", "ショルダープレス(マシン)", "肩", 2.5, 10),
    ("side-raise", "サイドレイズ", "肩", 1, 15),
    ("rear-delt-fly", "リアデルトフライ", "肩", 2.5, 10),
    ("biceps-curl", "バイセップスカール", "腕", 2.5, 10),
    ("incline-curl", "インクラインカール", "腕", 1, 10),
    ("triceps-extension", "トライセップスエクステンション", "腕", 2.5, 10),
    ("triceps-press", "トライセップスプレス", "腕", 2.5, 10),
    ("cable-pressdown", "ケーブルプレスダウン", "腕", 1.25, 10),
    ("wrist-curl", "リストカール", "腕", 1, 20),
    ("reverse-wrist-curl", "リバースリストカール", "腕", 1, 20),
    ("abdominal", "アブドミナル", "腹", 2.5, 10),
    ("leg-extension", "レッグエクステンション", "脚", 2.5, 10),
    ("leg-press", "レッグプレス", "脚", 5, 10),
]
BY_NAME = {m[1]: m for m in MASTER}

# メモ上の表記 -> 正規名 (「別名を統一」したものは review に一覧を出す)
ALIAS = {
    "ベンチプレス": "ベンチプレス",
    "ベンチプレススミス": "ベンチプレス(スミス)",
    "チェストプレス": "チェストプレス",
    "チェストプレスD": "チェストプレス",
    "ペックフライ": "ペックフライ",
    "インクラインスミス": "インクライン(スミス)",
    "インクラインベンチプレス": "インクラインベンチプレス",
    "インクラインチェストプレス": "インクラインチェストプレス",
    "RADプルダウン": "ラッドプルダウン",
    "ラッドプルダウン": "ラッドプルダウン",
    "プルダウン": "ラッドプルダウン",
    "プルダウン(マシン)": "プルダウン(マシン)",
    "ロー": "ロー",
    "シーテッドロー": "ロー",
    "懸垂": "懸垂",
    "ショルダープレス": "ショルダープレス",
    "ショルダープレス(マシン)": "ショルダープレス(マシン)",
    "ショルダープレス(マシーン)": "ショルダープレス(マシン)",
    "サイドレイズ": "サイドレイズ",
    "リアデルトフライ": "リアデルトフライ",
    "バイセップスカール": "バイセップスカール",
    "バイセップス・カール": "バイセップスカール",
    "インクラインカール": "インクラインカール",
    "トライセップスエクステンション": "トライセップスエクステンション",
    "トライセップス・エクステンション": "トライセップスエクステンション",
    "トライセップス・プレス": "トライセップスプレス",
    "ケーブルプレスダウン": "ケーブルプレスダウン",
    "リストカール": "リストカール",
    "リバースリストカール": "リバースリストカール",
    "アブドミナル": "アブドミナル",
    "レッグエクステンション": "レッグエクステンション",
    "レッグプレス": "レッグプレス",
}
MERGED = {"チェストプレスD", "RADプルダウン", "プルダウン", "シーテッドロー"}
PART_WORDS = {"胸", "肩", "腕", "背中", "前腕", "腹"}

review = []


def flag(date, raw, why):
    review.append((date, raw, why))


def norm_name(s):
    s = unicodedata.normalize("NFKC", s).strip()
    s = re.sub(r"\s+", "", s)
    return s


def parse_tail(tail, date, raw):
    """重量と回数の並びを sets に分解する。"""
    tail = unicodedata.normalize("NFKC", tail)
    sets = []
    notes = []
    weight = None
    pending_assist = False
    correct_w = None
    i = 0
    toks = re.findall(r"\d+(?:\.\d+)?\s*kg[^\s\d]*|\d+(?:\.\d+)?[^\s\d]*|補助|[^\s\d]+", tail)
    for t in toks:
        m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*kg(.*)", t)
        if m:
            if weight is not None and not any(s["w"] == weight for s in sets):
                flag(date, raw, f"{fmtw(weight)}kg の回数が書かれていません")
            if m.group(2).startswith("が正解"):
                notes.append(f"{m.group(1)}kgが正解")
                correct_w = float(m.group(1))
                flag(date, raw, f"「{m.group(1)}kgが正解」の注記に合わせて、全セットの重量を{m.group(1)}kgに直しました")
                continue
            weight = float(m.group(1))
            if m.group(2):
                notes.append(m.group(2))
                flag(date, raw, f"重量に注記「{m.group(2)}」が付いています")
            continue
        if t == "補助":
            pending_assist = True
            continue
        m = re.fullmatch(r"(\d+(?:\.\d+)?)(.*)", t)
        if m:
            reps = float(m.group(1))
            rest = m.group(2)
            if weight is None:
                flag(date, raw, "重量より前に回数が書かれています")
                continue
            if reps != int(reps):
                flag(date, raw, f"回数が小数です({m.group(1)})。整数に丸めました")
            s = {"w": weight, "r": int(reps)}
            if pending_assist:
                s["assist"] = True
                pending_assist = False
            if rest:
                if "補助" in rest:
                    s["assist"] = True
                notes.append(rest)
                s["note"] = rest
            sets.append(s)
            continue
        if t in PART_WORDS:
            continue
        m = re.fullmatch(r"補助(\d+)", t)
        if t.startswith("毎回補助"):
            notes.append(t)
            continue
        notes.append(t)
    if weight is not None and not any(s["w"] == weight for s in sets):
        flag(date, raw, f"{fmtw(weight)}kg の回数が書かれていません")
    if correct_w is not None:
        for st in sets:
            st["w"] = correct_w
    return sets, notes


def fmtw(w):
    return str(int(w)) if w == int(w) else str(w)


BY_ID_PART = {m[0]: m[2] for m in MASTER}
STAGE_PARTS = [{"胸"}, {"肩", "背中"}, {"腕", "腹"}]


def infer_stage(entries):
    """その日の種目から、3つのメニュー(胸 / 肩+背中 / 腕+腹)のどれに近いかを決める。"""
    score = [0, 0, 0]
    for e in entries:
        part = BY_ID_PART[e["exId"]]
        for i, ps in enumerate(STAGE_PARTS):
            if part in ps and part != "腹":
                score[i] += 1
    if max(score) == 0:
        return 2 if any(BY_ID_PART[e["exId"]] == "腹" for e in entries) else 0
    return score.index(max(score))


def main():
    lines = (ROOT / "data" / "raw_memo.txt").read_text(encoding="utf-8").splitlines()
    sessions = []
    cur = None
    last_entry = None
    used_alias = {}
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        nline = unicodedata.normalize("NFKC", line)
        m = re.match(r"^(\d{1,2})/(\d{1,2})\s*(.*)$", nline)
        if m and not re.match(r"^\d", m.group(3) or "x") :
            date = f"{YEAR}-{int(m.group(1)):02d}-{int(m.group(2)):02d}"
            cur = {"date": date, "parts": [p for p in m.group(3).split() if p], "entries": []}
            sessions.append(cur)
            last_entry = None
            continue
        if cur is None:
            continue
        # 前の種目の続きの行 (数字だけの行)
        if re.match(r"^[\d\s.]+$", nline) and last_entry is not None:
            base_w = last_entry["sets"][-1]["w"] if last_entry["sets"] else None
            if base_w is not None:
                for r in nline.split():
                    last_entry["sets"].append({"w": base_w, "r": int(float(r)), "note": "重量不明(前の行の続き)"})
                flag(cur["date"], line, "前の行の続きとして、直前の重量で追加しました。重量を確認してください")
            continue
        m = re.match(r"^([^\d]+?)\s*(\d.*)$", nline)
        if not m:
            flag(cur["date"], line, "種目として読み取れませんでした")
            continue
        name_raw = m.group(1).strip()
        head_note = None
        if "左のみ" in name_raw:
            head_note = "左のみ"
            name_raw = name_raw.replace("左のみ", "").strip()
        key = norm_name(name_raw)
        key_paren = key.replace("（", "(").replace("）", ")")
        if key_paren not in ALIAS:
            flag(cur["date"], line, f"未知の種目名「{name_raw}」")
            continue
        canon = ALIAS[key_paren]
        if name_raw in MERGED or key_paren in MERGED:
            used_alias[key_paren] = canon
        tail = m.group(2)
        # 重量の単位が kg 無しで書かれている行 (例: 67.5上がらず / 16k)
        tail = re.sub(r"^(\d+(?:\.\d+)?)(?![\d.])(?!\s*kg)k?", r"\1kg ", tail, count=1)
        sets, notes = parse_tail(tail, cur["date"], line)
        if "上がらず" in "".join(notes):
            flag(cur["date"], line, "「上がらず」: 回数0の失敗として記録しました")
            sets = [{"w": float(re.match(r"\d+(?:\.\d+)?", tail).group(0)), "r": 0, "note": "上がらず"}]
            notes = ["上がらず"]
        entry = {"name": canon, "sets": sets}
        if notes:
            entry["note"] = " / ".join(notes)
        if head_note:
            entry["note"] = (entry.get("note", "") + " " + head_note).strip()
        if not sets:
            flag(cur["date"], line, "セットが1つも読み取れませんでした")
        cur["entries"].append(entry)
        last_entry = entry

    out_sessions = []
    for s in sessions:
        entries = []
        for e in s["entries"]:
            if not e["sets"]:
                continue
            ex = BY_NAME[e["name"]]
            item = {"exId": ex[0], "sets": e["sets"]}
            if "note" in e:
                item["note"] = e["note"]
            entries.append(item)
        if entries:
            out_sessions.append({"date": s["date"], "stage": infer_stage(entries), "parts": s["parts"], "entries": entries})

    data = {
        "app": "gym-log",
        "version": 1,
        "exercises": [
            {"id": m[0], "name": m[1], "part": m[2], "unit": m[3], "goalReps": m[4]} for m in MASTER
        ],
        "sessions": out_sessions,
        "settings": {
            "nextStage": (out_sessions[-1]["stage"] + 1) % 3,
            "gymCount": len(out_sessions),
            "ntfyTopic": "",
        },
    }
    (ROOT / "data" / "gym-log-import.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    md = ["# 取り込みの確認一覧", "", f"セッション数: {len(out_sessions)} / 種目数: {sum(len(s['entries']) for s in out_sessions)}", ""]
    md += ["## 表記を統一した種目", ""]
    for k, v in sorted(used_alias.items()):
        md.append(f"- 「{k}」 → 「{v}」")
    md += ["", "## 判断がつかなかった行", ""]
    for d, raw, why in review:
        md.append(f"- {d} `{raw}` … {why}")
    (ROOT / "data" / "import_review.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print(f"sessions={len(out_sessions)} review={len(review)}")


if __name__ == "__main__":
    main()
