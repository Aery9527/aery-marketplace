#!/usr/bin/env python3
"""
檢查 design.md / plan.md / docs/sys 註冊表 / 目錄附屬檔是否符合 task-decomposition skill 規範。

用法：
    python check.py <target> [<target> ...]

target 自動辨識：
    符合 design.md / plan.md / review.md 命名規範的檔案 → 檔案層級驗證（檔名、DIRS 對齊、行數、同目錄附屬檔）
    list.md                                  → 註冊表驗證（從該 list.md 所在 docs/sys 為起點）
    .metadata.md                             → 目錄附屬驗證（檢查所在目錄是否合法位置）
    docs/sys 目錄                             → 註冊表驗證（從該目錄為起點）

檢查項目（規則固定於本腳本，AI 不得自行判斷）：
    [檔案層級]
        1. 檔名格式：design / plan / review 命名規則
           design:  <DIRS>[-DC.SUBNAME]-design[-draft].md
           plan:    <DIRS>[-DC.SUBNAME]-plan[-SUBNAME[.SEQUENCE]][-draft].md
           review:  <DIRS>[-DC.SUBNAME]-plan[-SUBNAME[.SEQUENCE]]-review[-draft].md
           draft 後綴一律 -draft（hyphen），不是 .draft（dot）。
        2. 路徑對齊：檔名 DIRS 需等於 docs/sys 之下的實際目錄序列以 - 串接，
           且每層目錄名稱僅允許 [a-z0-9]+（不含底線）。
           DC=0000 嚴禁使用（最頂層整合由無 DC 的 <DIRS>-design.md 擔任）。
           DC 不得以 0 開頭（頂層必須從千位數起點 1000/2000/... 開始）。
        3. 行數限制（僅對非 -draft 檔案）:
           design  上限 300 行（超過：FAIL）
           plan    上限 500 行（超過：WARN）
           review  上限 500 行（超過：WARN，沿用 plan 限制）
        4. -draft 暫存檔：僅檢查命名，不檢查行數（PASS-DRAFT）。
        5. 同目錄附屬檔：檔案所在目錄必須有 .metadata.md（PASS-METADATA / FAIL-METADATA）。
        6. god-view 互斥：若該目錄包含 DC 拆檔的 design 文件（頂層 <DIRS>-design.md
           退化為 god-view），且該目錄內存在「無 DC 的 <DIRS>-plan*.md」或對應的
           「無 DC 的 <DIRS>-plan*-review*.md」，則回報 FAIL-GODVIEW-PLAN。對應到具體
           DC 拆檔的 plan / review（<DIRS>-NNNN.SUB-plan*.md / -review*.md）是允許的，
           不會觸發此錯誤。

    [註冊表層級]
        7. 每個 docs/sys 目錄必須存在 list.md（即使無下游節點，也要空檔存在）。
        8. list.md 中的每個引用路徑必須存在、為目錄、且以 docs/sys 結尾。
        9. 整個註冊樹不得有循環相依（A → B → A 或更長鏈路皆禁止）。
        10. 同一節點可被多處引用（DAG 允許），只是不重複驗證。
        11. 每個 docs/sys 子樹下的所有目錄都必須有 .metadata.md（整樹遞迴檢查）。

回報前綴：
    [PASS-NAME] / [FAIL-NAME]
    [PASS-LINES] / [WARN-LINES] / [FAIL-LINES]
    [PASS-DRAFT]
    [PASS-METADATA] / [FAIL-METADATA]
    [PASS-REGISTRY] / [FAIL-REGISTRY] / [FAIL-CYCLE] / [FAIL-LIST-MISSING]
    [FAIL-GODVIEW-PLAN]
    [FAIL] 路徑層級錯誤（不存在、無法辨識類型等）

退出碼：
    0  全部通過或僅有 WARN
    1  存在任何 FAIL
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# Windows console 預設可能不是 UTF-8，強制設定避免中文亂碼。
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

# 從腳本自身位置推導 skill root 與 project root，避免寫死路徑。
#   check.py → scripts/ → task-decomposition/ → skills/ → .claude/ → project root
_SKILL_ROOT = Path(__file__).resolve().parents[1]   # task-decomposition/
_PROJECT_ROOT = _SKILL_ROOT.parents[2]              # skill root 往上 3 層 = project root
DOCS_SYS_ROOT = _PROJECT_ROOT / "docs" / "sys"

DESIGN_LIMIT = 300
PLAN_LIMIT = 500

# 目錄名稱僅允許小寫英文 / 數字（不含底線、連字號或其他符號）。
DIR_NAME = re.compile(r"^[a-z0-9]+$")

# DC.SUBNAME：DC 為 4 碼數字，SUBNAME 為 [a-z0-9_]+。
DESIGN_PATTERN = re.compile(
    r"^(?P<dirs>[a-z0-9]+(?:-[a-z0-9]+)*?)"
    r"(?:-(?P<dc>\d{4})\.(?P<dc_subname>[a-z0-9_]+))?"
    r"-design"
    r"(?P<draft>-draft)?"
    r"\.md$"
)

PLAN_PATTERN = re.compile(
    # SUBNAME 名稱不得單獨等於 'review' 或 'draft'，避免與後綴衝突；
    # negative lookahead 阻擋以 review/draft 起頭、後接 - / . / 結尾 的 SUBNAME。
    r"^(?P<dirs>[a-z0-9]+(?:-[a-z0-9]+)*?)"
    r"(?:-(?P<dc>\d{4})\.(?P<dc_subname>[a-z0-9_]+))?"
    r"-plan"
    r"(?:-(?!(?:review|draft)(?:[-.]|$))(?P<subname>[a-z0-9_]+)(?:\.(?P<sequence>\d{2}))?)?"
    r"(?P<review>-review)?"
    r"(?P<draft>-draft)?"
    r"\.md$"
)

# list.md 中的 markdown bullet link：- [label](path)
LIST_LINK_PATTERN = re.compile(r"^\s*-\s+\[[^\]]+\]\(([^)]+)\)")


# ===================================================================
# 檔案層級驗證
# ===================================================================

def extract_path_dirs(path: Path):
    """從路徑抽取 docs/sys 之下、檔案所在的目錄序列；不在 docs/sys 下則回傳 None。"""
    try:
        resolved = path.resolve()
    except Exception:
        resolved = path

    # 優先比對 project-root 推導出的 DOCS_SYS_ROOT，再 fallback 至慣例字串比對。
    try:
        rel = resolved.relative_to(DOCS_SYS_ROOT)
        return list(rel.parts[:-1])
    except ValueError:
        pass

    parts = resolved.parts
    for i in range(len(parts) - 2):
        if parts[i] == "docs" and parts[i + 1] == "sys":
            return list(parts[i + 2 : -1])
    return None


def check_naming(arg: str, path: Path):
    """回傳 (ok, info, msg)；info = (kind, is_draft, dc) 或 None。"""
    name = path.name
    design_m = DESIGN_PATTERN.match(name)
    plan_m = PLAN_PATTERN.match(name)

    if design_m:
        kind, m = "design", design_m
        is_draft = bool(design_m.group("draft"))
        dc = design_m.group("dc")
    elif plan_m:
        kind = "review" if plan_m.group("review") else "plan"
        m = plan_m
        is_draft = bool(plan_m.group("draft"))
        dc = plan_m.group("dc")
    else:
        return False, None, f"[FAIL-NAME] {arg} — 檔名不符 design / plan / review 命名規範（draft 後綴須為 -draft 不是 .draft）"

    file_dirs = m.group("dirs")
    path_dirs = extract_path_dirs(path)

    if path_dirs is None:
        return False, (kind, is_draft, dc), f"[FAIL-NAME] {arg} — 不在 docs/sys 之下"
    if not path_dirs:
        return False, (kind, is_draft, dc), f"[FAIL-NAME] {arg} — docs/sys 之下需有至少一層目錄"

    bad = [d for d in path_dirs if not DIR_NAME.match(d)]
    if bad:
        return False, (kind, is_draft, dc), (
            f"[FAIL-NAME] {arg} — 路徑目錄名稱違規 {bad}（必須為 [a-z0-9]+，不得含 '-' 或 '_'）"
        )

    expected_dirs = "-".join(path_dirs)
    if file_dirs != expected_dirs:
        return False, (kind, is_draft, dc), (
            f"[FAIL-NAME] {arg} — DIRS 不一致：檔名為 '{file_dirs}'，"
            f"路徑推導為 '{expected_dirs}'"
        )

    if dc == "0000":
        return False, (kind, is_draft, dc), (
            f"[FAIL-NAME] {arg} — DC 嚴禁使用 '0000'（最頂層整合一律由無 DC 的對應檔案擔任，"
            "不得用 0000 取代）"
        )

    if dc and dc[0] == "0":
        return False, (kind, is_draft, dc), (
            f"[FAIL-NAME] {arg} — DC '{dc}' 違反千位數起點原則（頂層拆分必須從 "
            "1000、2000... 開始，禁止直接從百位數或更小起步如 0100、0010；"
            "百位數以下保留給後續向下拆分時使用）"
        )

    label = f"{kind}, draft" if is_draft else kind
    return True, (kind, is_draft, dc), f"[PASS-NAME] {arg} ({label}) DIRS='{file_dirs}'"


def check_lines(arg: str, path: Path, kind: str):
    with path.open("r", encoding="utf-8") as f:
        lines = sum(1 for _ in f)

    limit = DESIGN_LIMIT if kind == "design" else PLAN_LIMIT
    is_blocker = kind == "design"

    if lines <= limit:
        return False, f"[PASS-LINES] {arg} ({kind}) {lines}/{limit} 行"

    excess = lines - limit
    if is_blocker:
        return True, (
            f"[FAIL-LINES] {arg} ({kind}) {lines}/{limit} 行 — "
            f"超過 {excess} 行，必須拆分"
        )
    return False, (
        f"[WARN-LINES] {arg} ({kind}) {lines}/{limit} 行 — "
        f"超過 {excess} 行，建議拆分"
    )


def check_metadata(arg: str, path: Path):
    """檢查所在目錄存在 .metadata.md；回傳 has_blocker。"""
    metadata = path.parent / ".metadata.md"
    if metadata.exists():
        print(f"[PASS-METADATA] {arg} — 同目錄 .metadata.md 存在")
        return False
    print(
        f"[FAIL-METADATA] {arg} — 同目錄缺少 .metadata.md（每個目錄必須有 .metadata.md，"
        "即使無內容也要空檔存在）"
    )
    return True


def check_godview_plan_conflict(arg: str, path: Path):
    """
    god-view / plan 衝突檢查。

    依 name-rules：當同目錄出現 DC 拆檔 design（<DIRS>-NNNN.SUB-design[-draft].md）時，
    本目錄頂層 <DIRS>-design.md 退化為 god-view 整合，因此 **無 DC 的 <DIRS>-plan*.md**
    不得出現；plan 必須對應到具體 DC 拆檔（<DIRS>-NNNN.SUB-plan*.md），這些 plan 是允許的。

    回傳 has_blocker。
    """
    parent = path.parent
    if not parent.is_dir():
        return False

    has_dc_design = False
    has_no_dc_plan = False
    for child in parent.iterdir():
        if not child.is_file():
            continue
        if not child.name.endswith(".md"):
            continue
        m_design = DESIGN_PATTERN.match(child.name)
        if m_design and m_design.group("dc"):
            has_dc_design = True
            continue
        m_plan = PLAN_PATTERN.match(child.name)
        if m_plan and not m_plan.group("dc"):
            has_no_dc_plan = True

    if has_dc_design and has_no_dc_plan:
        print(
            f"[FAIL-GODVIEW-PLAN] {arg} — 同目錄存在 DC 拆檔 design，頂層 <DIRS>-design.md 已退化為 "
            "god-view，**嚴禁** 出現無 DC 的 <DIRS>-plan*.md / <DIRS>-plan*-review*.md；"
            "plan 與 review 必須對應具體 DC 拆檔"
        )
        return True
    return False


def check_file(arg: str, path: Path):
    """回傳 has_blocker。"""
    name_ok, info, name_msg = check_naming(arg, path)
    print(name_msg)
    if not name_ok or info is None:
        return True

    kind, is_draft, _dc = info

    blocker = False

    # .metadata.md 必存
    if check_metadata(arg, path):
        blocker = True

    # god-view / plan 衝突保守檢查
    if check_godview_plan_conflict(arg, path):
        blocker = True

    if is_draft:
        # 暫存檔僅檢查命名，不驗行數（內容尚未撰寫）
        print(f"[PASS-DRAFT] {arg} ({kind}, draft) — 暫存檔，內容尚未撰寫，完成後 rename 移除 -draft 後綴")
        return blocker

    line_blocker, line_msg = check_lines(arg, path, kind)
    print(line_msg)
    if line_blocker:
        blocker = True
    return blocker


# ===================================================================
# 註冊表層級驗證（list.md + 循環偵測）
# ===================================================================

def parse_list_md(list_md: Path):
    """回傳 [(line_no, raw_path), ...]。"""
    entries = []
    with list_md.open("r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            m = LIST_LINK_PATTERN.match(line)
            if m:
                entries.append((line_no, m.group(1).strip()))
    return entries


def is_docs_sys_dir(p: Path) -> bool:
    # 先比對 project-root 推導出的 DOCS_SYS_ROOT；registry 含多倉庫子模組時，
    # 仍 fallback 至慣例（name=="sys" 且 parent.name=="docs"）來相容任意位置。
    try:
        if p.resolve() == DOCS_SYS_ROOT.resolve():
            return True
    except Exception:
        pass
    return p.name == "sys" and p.parent.name == "docs"


def walk_registry(start_dir: Path, visited: set, in_path: set,
                  path_chain: list, errors: list):
    """
    遞迴走訪 docs/sys 註冊樹。

    visited:    所有已驗證過的節點（避免 DAG 共用子樹被重複檢查）
    in_path:    當前 DFS 路徑上的節點（用於循環偵測）
    path_chain: 當前路徑列表（用於錯誤訊息呈現循環鏈路）
    errors:     累積錯誤訊息
    """
    abs_dir = start_dir.resolve()

    if abs_dir in in_path:
        # 找到當前 chain 中循環的起點
        try:
            start_idx = path_chain.index(abs_dir)
            cycle = path_chain[start_idx:] + [abs_dir]
        except ValueError:
            cycle = path_chain + [abs_dir]
        errors.append(
            "[FAIL-CYCLE] 循環相依："
            + " -> ".join(str(p) for p in cycle)
        )
        return

    if abs_dir in visited:
        return

    if not is_docs_sys_dir(abs_dir):
        errors.append(
            f"[FAIL-REGISTRY] {start_dir} — 註冊節點必須以 docs/sys 結尾"
        )
        return

    visited.add(abs_dir)
    in_path.add(abs_dir)
    path_chain.append(abs_dir)

    list_md = abs_dir / "list.md"
    if not list_md.exists():
        errors.append(
            f"[FAIL-LIST-MISSING] {abs_dir} — 缺少 list.md（每個 docs/sys 必須有 list.md，"
            "即使無下游節點也要空檔存在）"
        )
    else:
        for line_no, raw_path in parse_list_md(list_md):
            ref_path = abs_dir / raw_path
            try:
                ref_resolved = ref_path.resolve()
            except Exception:
                errors.append(
                    f"[FAIL-REGISTRY] {list_md}:{line_no} — "
                    f"無法解析路徑 '{raw_path}'"
                )
                continue

            if not ref_resolved.exists():
                errors.append(
                    f"[FAIL-REGISTRY] {list_md}:{line_no} — "
                    f"引用路徑不存在 '{raw_path}'"
                )
                continue

            if not ref_resolved.is_dir():
                errors.append(
                    f"[FAIL-REGISTRY] {list_md}:{line_no} — "
                    f"引用必須為目錄 '{raw_path}'"
                )
                continue

            if not is_docs_sys_dir(ref_resolved):
                errors.append(
                    f"[FAIL-REGISTRY] {list_md}:{line_no} — "
                    f"引用必須以 docs/sys 結尾 '{raw_path}'"
                )
                continue

            walk_registry(ref_resolved, visited, in_path, path_chain, errors)

    in_path.discard(abs_dir)
    path_chain.pop()


def check_metadata_tree(start_dir: Path, errors: list):
    """遞迴檢查 docs/sys 之下所有目錄都存在 .metadata.md。"""
    for sub in start_dir.rglob("*"):
        if not sub.is_dir():
            continue
        # 跳過已知非規範目錄（例如 IDE / VCS 隱藏資料夾）
        if any(part.startswith(".") and part not in (".",) for part in sub.relative_to(start_dir).parts):
            continue
        metadata = sub / ".metadata.md"
        if not metadata.exists():
            errors.append(
                f"[FAIL-METADATA] {sub} — 缺少 .metadata.md（每個目錄必須有 .metadata.md，"
                "即使無內容也要空檔存在）"
            )
    # 同時檢查 start_dir 自己
    if not (start_dir / ".metadata.md").exists():
        errors.append(
            f"[FAIL-METADATA] {start_dir} — 缺少 .metadata.md"
        )


def check_registry(arg: str, start_dir: Path):
    """回傳 has_blocker。"""
    visited = set()
    errors = []
    walk_registry(start_dir, visited, set(), [], errors)
    # 對每個被走訪的 docs/sys 節點，遞迴檢查其下所有目錄都有 .metadata.md
    for node in visited:
        check_metadata_tree(node, errors)

    for err in errors:
        print(err)

    if errors:
        return True

    print(f"[PASS-REGISTRY] {arg} — {len(visited)} 個節點，無循環，所有 list.md / .metadata.md 完備")
    return False


# ===================================================================
# 入口
# ===================================================================

def check_one(arg: str):
    path = Path(arg)

    if not path.exists():
        print(f"[FAIL] {arg} — 路徑不存在")
        return True

    if path.is_dir():
        if not is_docs_sys_dir(path.resolve()):
            print(f"[FAIL] {arg} — 目錄必須以 docs/sys 結尾才能進入註冊表驗證")
            return True
        return check_registry(arg, path)

    if path.name == "list.md":
        if not is_docs_sys_dir(path.parent.resolve()):
            print(f"[FAIL] {arg} — list.md 必須位於 docs/sys 目錄內")
            return True
        return check_registry(arg, path.parent)

    if path.name == ".metadata.md":
        # 檢查所在目錄是否在 docs/sys 之下
        path_dirs = extract_path_dirs(path)
        if path_dirs is None:
            print(f"[FAIL] {arg} — .metadata.md 必須位於 docs/sys 之下的目錄")
            return True
        bad = [d for d in path_dirs if not DIR_NAME.match(d)]
        if bad:
            print(
                f"[FAIL-NAME] {arg} — 路徑目錄名稱違規 {bad}"
                "（必須為 [a-z0-9]+，不得含 '-' 或 '_'）"
            )
            return True
        print(f"[PASS-METADATA] {arg} — .metadata.md 位置合法")
        return False

    if path.suffix == ".md":
        return check_file(arg, path)

    print(f"[FAIL] {arg} — 不支援的檔案類型")
    return True


def main(argv):
    if not argv:
        if DOCS_SYS_ROOT.is_dir():
            argv = [str(DOCS_SYS_ROOT)]
        else:
            print(__doc__)
            return 1

    has_blocker = False
    for arg in argv:
        if check_one(arg):
            has_blocker = True

    return 1 if has_blocker else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
