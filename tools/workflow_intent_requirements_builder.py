#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Workflow Intent/Requirements Builder
-----------------------------------
برنامج خارجي يساعدك على:
1) سحب ملف ووركفلو (ComfyUI API JSON)
2) توليد snippet جاهز لـ intents.yml
3) توليد snippet جاهز لـ workflow_requirements.yml

ملاحظات:
- لا يعدّل أي ملف تلقائياً.
- يجهز لك النص للنسخ واللصق فقط.
- يدعم السحب والإفلات إذا كانت مكتبة tkinterdnd2 متوفرة.

يدعم جميع الخصائص:
  positive, negative, image, image2, image3,
  video, video2, audio, audio2,
    random_num,
  result*text, result*image, result*video, result*audio,
  save: true (حتى 3 عقد), result section (node, kind, index)
"""

from __future__ import annotations

import json
import re
import yaml
import zipfile
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from tkinter.scrolledtext import ScrolledText

try:
    from tkinterdnd2 import TkinterDnD, DND_FILES  # type: ignore
except Exception:
    TkinterDnD = None
    DND_FILES = None

# ─── ثوابت ──────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
INTENTS_PATH = PROJECT_ROOT / "intents.yml"
WF_REQ_PATH = PROJECT_ROOT / "workflow_requirements.yml"
WORKFLOWS_DIR = PROJECT_ROOT / "workflows"

SAVE_CLASS_HINTS = {
    "saveimage", "saveanimatedwebp", "vhs_videocombine",
    "savevideo", "saveaudio", "previewimage",
}

# ─── Translations ────────────────────────────────────────────────────
_LANG_CODES = ("en", "ar", "zh", "ja")
_LANG_NAMES = {"en": "English", "ar": "العربية", "zh": "中文", "ja": "日本語"}
_current_lang = "en"

_TR: dict[str, tuple[str, str, str, str]] = {
    "title":        ("EasyUI Workflow Builder", "EasyUI منشئ الوركفلو", "EasyUI 工作流构建器", "EasyUI ワークフロービルダー"),
    "browse":       ("Browse", "استعراض", "浏览", "参照"),
    "load":         ("Load", "تحميل", "加载", "読込"),
    "drop_here":    ("Drag & drop workflow API JSON here", "اسحب ملف workflow API JSON هنا",
                     "将工作流 API JSON 拖放到此处", "ワークフロー API JSON をここにドロップ"),
    "mapping":      ("Manual mapping — Node IDs & Input Keys", "تحديد يدوي — Node IDs و Input Keys",
                     "手动映射 — 节点ID与输入键", "手動マッピング — ノードIDと入力キー"),
    "result_sec":   ("Result (optional — output node)", "Result (اختياري — عقدة المخرجات)",
                     "Result（可选 - 输出节点）", "Result（任意 - 出力ノード）"),
    "generate":     ("Generate", "توليد", "生成", "生成"),
    "copy_int":     ("Copy Intent", "نسخ النية", "复制意图", "インテントをコピー"),
    "copy_req":     ("Copy Requirements", "نسخ المتطلبات", "复制需求", "要件をコピー"),
    "save_files":   ("💾 Save to Files", "💾 حفظ إلى الملفات", "💾 保存到文件", "💾 ファイルに保存"),
    "delete_sel":   ("🗑 Delete Selected", "🗑 حذف المحدد", "🗑 删除所选", "🗑 選択を削除"),
    "refresh":      ("🔄 Refresh List", "🔄 تحديث القائمة", "🔄 刷新列表", "🔄 リスト更新"),
    "exp_zip":      ("📦 Export ZIP", "📦 تصدير ZIP", "📦 导出ZIP", "📦 ZIPエクスポート"),
    "exp_sel":      ("📦 Export Selected", "📦 تصدير المحدد", "📦 导出所选", "📦 選択をエクスポート"),
    "imp_zip":      ("📥 Import ZIP", "📥 استيراد ZIP", "📥 导入ZIP", "📥 ZIPインポート"),
    "entries":      ("Saved entries — double-click to load & edit", "العناصر المحفوظة — دبل كليك لتحميل وتعديل",
                     "已保存条目 — 双击加载编辑", "保存済み — ダブルクリックで読込・編集"),
    "output":       ("Output", "المخرجات", "输出", "出力"),
    "dnd_off":      ("Drag & Drop disabled (optional: pip install tkinterdnd2)",
                     "السحب والإفلات غير مفعل (اختياري: pip install tkinterdnd2)",
                     "拖放已禁用（可选: pip install tkinterdnd2）",
                     "ドラッグ＆ドロップ無効（任意: pip install tkinterdnd2）"),
    "lang":         ("Language:", "اللغة:", "语言:", "言語:"),
    "choose_wf":    ("Choose a workflow file first.", "اختر ملف workflow أولاً.",
                     "请先选择工作流文件。", "先にワークフローファイルを選択してください。"),
    "not_found":    ("File not found.", "الملف غير موجود.", "文件未找到。", "ファイルが見つかりません。"),
    "loaded":       ("Workflow loaded. Select Node IDs then Generate.",
                     "تم تحميل الوركفلو. اختر Node IDs ثم اضغط Generate.",
                     "工作流已加载。选择节点ID后点击生成。",
                     "ワークフロー読込完了。ノードID選択後に生成を押してください。"),
    "gen_first":    ("Press Generate first.", "اضغط Generate أولاً.",
                     "请先点击生成。", "先に生成を押してください。"),
    "confirm_save": ("Confirm Save", "تأكيد الحفظ", "确认保存", "保存確認"),
    "save_q":       ("Save '{name}' to original files?\n\nWill write to:\n  • {f1}\n  • {f2}",
                     "هل تريد حفظ '{name}' في الملفات الأصلية؟\n\nسيتم الكتابة في:\n  • {f1}\n  • {f2}",
                     "将 '{name}' 保存到原始文件？\n\n写入：\n  • {f1}\n  • {f2}",
                     "'{name}' を元のファイルに保存しますか？\n\n書込先：\n  • {f1}\n  • {f2}"),
    "errors":       ("Errors", "أخطاء", "错误", "エラー"),
    "saved_ok":     ("'{name}' saved successfully.", "تم حفظ '{name}' بنجاح.",
                     "'{name}' 保存成功。", "'{name}' の保存に成功しました。"),
    "pick_item":    ("Select an item", "اختر عنصراً", "选择一项", "項目を選択"),
    "pick_del":     ("Select an item to delete.", "حدد عنصراً من إحدى القائمتين للحذف.",
                     "选择要删除的项目。", "削除する項目を選択してください。"),
    "confirm_del":  ("Confirm Delete", "تأكيد الحذف", "确认删除", "削除確認"),
    "del_q":        ("Permanently delete?\n\n{items}", "هل تريد حذف العناصر التالية نهائياً؟\n\n{items}",
                     "永久删除？\n\n{items}", "完全に削除しますか？\n\n{items}"),
    "deleted":      ("Deleted successfully.", "تم حذف العناصر بنجاح.", "删除成功。", "削除に成功しました。"),
    "wf_missing":   ("Workflow file not found.", "ملف الوركفلو غير موجود.",
                     "工作流文件未找到。", "ワークフローファイルが見つかりません。"),
    "gen_export":   ("Press Generate first.", "اضغط Generate أولاً لتوليد البيانات.",
                     "请先点击生成。", "先に生成を押してください。"),
    "save_zip":     ("Save ZIP file", "حفظ ملف ZIP", "保存ZIP文件", "ZIPファイルを保存"),
    "exported":     ("Exported", "تم التصدير", "已导出", "エクスポート完了"),
    "exp_msg":      ("'{name}' exported to:\n{path}", "تم تصدير '{name}' إلى:\n{path}",
                     "'{name}' 已导出到：\n{path}", "'{name}' のエクスポート先：\n{path}"),
    "pick_exp":     ("Select an item to export.", "حدد عنصراً من إحدى القائمتين للتصدير.",
                     "选择要导出的项目。", "エクスポートする項目を選択してください。"),
    "no_data":      ("No saved data for '{name}'.", "لا توجد بيانات محفوظة لـ '{name}'.",
                     "'{name}' 没有已保存数据。", "'{name}' の保存データがありません。"),
    "exp_ok":       ("'{name}' exported.", "تم تصدير '{name}' بنجاح.",
                     "'{name}' 导出成功。", "'{name}' のエクスポート完了。"),
    "wf_ok":        ("✅ Workflow: {f}", "✅ ملف الوركفلو: {f}", "✅ 工作流：{f}", "✅ ワークフロー：{f}"),
    "wf_no":        ("⚠ '{f}' not found — not added.", "⚠ ملف '{f}' غير موجود — لم يُضف للأرشيف.",
                     "⚠ '{f}' 未找到—未添加。", "⚠ '{f}' が見つかりません—追加されませんでした。"),
    "pick_zip":     ("Choose ZIP to import", "اختر ملف ZIP للاستيراد",
                     "选择要导入的ZIP", "インポートするZIPを選択"),
    "pick_dir":     ("Choose workflow folder (e.g. workflows/main)", "اختر مجلد الوركفلو (مثلاً workflows/main)",
                     "选择工作流文件夹（如 workflows/main）", "ワークフローフォルダを選択（例: workflows/main）"),
    "imported":     ("Imported", "تم الاستيراد", "已导入", "インポート完了"),
    "imp_msg":      ("'{name}' imported!\n\nWorkflow: {f}\nFolder: {d}\nIntent & requirements added.",
                     "تم استيراد '{name}'!\n\nالوركفلو: {f}\nالمجلد: {d}\nتمت إضافة النية والمتطلبات.",
                     "'{name}' 已导入！\n\n工作流：{f}\n文件夹：{d}\n已添加意图和需求。",
                     "'{name}' インポート完了！\n\nワークフロー：{f}\nフォルダ：{d}\nインテントと要件を追加しました。"),
    "load_edit":    ("'{name}' loaded for editing. Edit → Generate → Save.",
                     "تم تحميل '{name}' للتعديل. عدّل → Generate → حفظ.",
                     "'{name}' 已加载。编辑→生成→保存。",
                     "'{name}' を読込みました。編集→生成→保存。"),
    "copied":       ("Copied to clipboard.", "تم نسخ النص إلى الحافظة.",
                     "已复制到剪贴板。", "クリップボードにコピーしました。"),
    "ui_not_api":   ("This file is UI format, not API.\nExport in API Format from ComfyUI.",
                     "هذا الملف بصيغة UI وليس API.\nصدّر بصيغة API Format من ComfyUI.",
                     "此文件是UI格式非API。\n请从ComfyUI导出API格式。",
                     "UIフォーマットです。ComfyUIからAPIフォーマットでエクスポートしてください。"),
    "bad_json":     ("Unsupported JSON format.", "صيغة JSON غير مدعومة.",
                     "不支持的JSON格式。", "サポートされていないJSON形式です。"),
    "no_meta":      ("ZIP has no meta.json", "الملف المضغوط لا يحتوي على meta.json",
                     "ZIP中没有meta.json", "ZIPにmeta.jsonがありません"),
    "no_wf_meta":   ("Workflow filename not set in meta.json", "لم يتم تحديد ملف الوركفلو في meta.json",
                     "meta.json中未设置工作流文件名", "meta.jsonにワークフロー名が未設定です"),
    "warning":      ("Warning", "تحذير", "警告", "警告"),
    "error":        ("Error", "خطأ", "错误", "エラー"),
    "success":      ("Success", "نجاح", "成功", "成功"),
    "all_images":   ("🖼 All Images", "🖼 كل الصور", "🖼 全部图像", "🖼 全画像"),
    "clear_auto":   ("✕ Clear", "✕ مسح", "✕ 清除", "✕ クリア"),
    "auto_none":    ("Auto: —", "Auto: —", "Auto: —", "Auto: —"),
    "auto_found":   ("Auto ({n}): {ids}", "Auto ({n}): {ids}", "Auto ({n}): {ids}", "Auto ({n}): {ids}"),
    "auto_empty":   ("Auto: No save nodes in workflow", "Auto: لا توجد عقد حفظ في الوركفلو",
                     "Auto: 工作流中无保存节点", "Auto: ワークフローに保存ノードなし"),
}


def t(key: str, **kw) -> str:
    """Return translated string for current language."""
    idx = _LANG_CODES.index(_current_lang)
    tr = _TR.get(key)
    if not tr:
        return key
    s = tr[idx] if idx < len(tr) else tr[0]
    if kw:
        s = s.format(**kw)
    if _current_lang == "ar":
        s = "\u200f" + s
    return s


# ─── دوال مساعدة ────────────────────────────────────────────────────
def normalize_name(text: str) -> str:
    text = text.strip().lower()
    text = re.sub(r"[^a-z0-9_]+", "_", text)
    text = re.sub(r"_+", "_", text).strip("_")
    return text or "new_intent"


def ltr_yaml(text: str) -> str:
    """أضف علامة LRM في بداية كل سطر لإجبار اتجاه LTR في عرض YAML."""
    return "\n".join("\u200e" + line for line in text.split("\n"))


def parse_dnd_path(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("{") and raw.endswith("}"):
        raw = raw[1:-1]
    return raw


def node_display(node_id: str, node: dict) -> str:
    c = str(node.get("class_type", "")).strip() or "Unknown"
    return f"{node_id} | {c}"


def parse_node_id(selection: str) -> str:
    s = (selection or "").strip()
    if not s:
        return ""
    return s.split("|", 1)[0].strip()


def load_workflow_api_json(file_path: Path) -> dict[str, dict]:
    data = json.loads(file_path.read_text(encoding="utf-8"))
    if isinstance(data, dict) and data and all(isinstance(v, dict) for v in data.values()):
        if any("class_type" in v for v in data.values()):
            return {str(k): v for k, v in data.items()}
    if isinstance(data, dict) and "nodes" in data:
        raise ValueError(t("ui_not_api"))
    raise ValueError(t("bad_json"))


# ─── بناء YAML ──────────────────────────────────────────────────────
def build_requirements_yaml(
    workflow_name: str,
    mappings: list[tuple[str, str, str]],
    save_nodes: list[str],
    result_node: str = "",
    result_kind: str = "",
    result_index: str = "",
) -> str:
    lines: list[str] = [f"{workflow_name}:", "  nodes:"]

    # تجميع الحقول حسب العقدة
    by_node: dict[str, list[tuple[str, str]]] = {}
    for node_id, input_key, var_name in mappings:
        by_node.setdefault(node_id, []).append((input_key, var_name))

    for node_id, fields in by_node.items():
        lines.append(f'    "{node_id}":')
        lines.append("      inputs:")
        for input_key, var_name in fields:
            lines.append(f"        {input_key}: {var_name}")

    for node_id in save_nodes:
        lines.append(f'    "{node_id}":')
        lines.append("      save: true")

    if not mappings and not save_nodes:
        lines.append("    # لم يتم تحديد حقول")

    # result section
    if result_node:
        lines.append("  result:")
        lines.append(f'    node: "{result_node}"')
        if result_kind:
            lines.append(f"    kind: {result_kind}")
        if result_index:
            lines.append(f"    index: {result_index}")

    return "\n".join(lines) + "\n"


def build_intent_yaml(
    intent_name: str,
    workflow_file: str,
    aliases: list[str],
    no_remove: bool,
) -> str:
    lines = [f"  {intent_name}:", f"    file: {workflow_file}"]
    if no_remove:
        lines.append("    no_remove: true")
    lines.append("    aliases:")
    if aliases:
        for al in aliases:
            lines.append(f'      - "{al}"')
    else:
        lines.append(f'      - "{intent_name}"')
    return "\n".join(lines) + "\n"


# ─── حفظ / حذف من الملفات الأصلية ───────────────────────────────────
def load_existing_entries() -> tuple[list[str], list[str]]:
    """يقرأ أسماء المفاتيح من intents.yml و workflow_requirements.yml."""
    intent_keys: list[str] = []
    req_keys: list[str] = []
    try:
        data = yaml.safe_load(INTENTS_PATH.read_text(encoding="utf-8")) or {}
        intents = data.get("intents", {}) or {}
        intent_keys = list(intents.keys())
    except Exception:
        pass
    try:
        data = yaml.safe_load(WF_REQ_PATH.read_text(encoding="utf-8")) or {}
        req_keys = [k for k in data.keys() if not str(k).startswith("#")]
    except Exception:
        pass
    return intent_keys, req_keys


def save_intent_to_file(intent_name: str, intent_snippet: str) -> None:
    """يضيف/يحدّث نيّة في intents.yml."""
    raw = INTENTS_PATH.read_text(encoding="utf-8") if INTENTS_PATH.exists() else ""
    data = yaml.safe_load(raw) or {}
    if "intents" not in data:
        data["intents"] = {}

    # بناء كائن النية من الـ snippet
    snippet_data = yaml.safe_load(intent_snippet)
    if isinstance(snippet_data, dict):
        data["intents"].update(snippet_data)

    with open(INTENTS_PATH, "w", encoding="utf-8") as f:
        # كتابة التعليق الأول
        f.write("# intents.yml\n#\n")
        f.write("# الخيارات المتاحة لكل نيّة:\n")
        f.write("#   file: اسم ملف الوركفلو (أو null إذا لا يوجد)\n")
        f.write("#   response: رد ثابت نصي\n")
        f.write("#   response_file: ملف نصي للرد\n")
        f.write("#   no_remove: true  ← عند التفعيل لا يُشطب كلمة الـalias من النص\n")
        f.write("#\n")
        yaml.dump(data, f, allow_unicode=True, default_flow_style=False, sort_keys=False)


def save_requirement_to_file(req_snippet: str) -> None:
    """يضيف/يحدّث متطلبات وركفلو في workflow_requirements.yml."""
    raw = WF_REQ_PATH.read_text(encoding="utf-8") if WF_REQ_PATH.exists() else ""
    data = yaml.safe_load(raw) or {}
    snippet_data = yaml.safe_load(req_snippet)
    if isinstance(snippet_data, dict):
        data.update(snippet_data)

    with open(WF_REQ_PATH, "w", encoding="utf-8") as f:
        f.write("# workflow_requirements.yml\n\n")
        yaml.dump(data, f, allow_unicode=True, default_flow_style=False, sort_keys=False)


def delete_intent_from_file(intent_name: str) -> bool:
    """يحذف نيّة من intents.yml."""
    raw = INTENTS_PATH.read_text(encoding="utf-8") if INTENTS_PATH.exists() else ""
    data = yaml.safe_load(raw) or {}
    intents = data.get("intents", {})
    if intent_name not in intents:
        return False
    del intents[intent_name]
    with open(INTENTS_PATH, "w", encoding="utf-8") as f:
        f.write("# intents.yml\n#\n")
        f.write("# الخيارات المتاحة لكل نيّة:\n")
        f.write("#   file: اسم ملف الوركفلو (أو null إذا لا يوجد)\n")
        f.write("#   response: رد ثابت نصي\n")
        f.write("#   response_file: ملف نصي للرد\n")
        f.write("#   no_remove: true  ← عند التفعيل لا يُشطب كلمة الـalias من النص\n")
        f.write("#\n")
        yaml.dump(data, f, allow_unicode=True, default_flow_style=False, sort_keys=False)
    return True


def delete_requirement_from_file(req_name: str) -> bool:
    """يحذف متطلبات وركفلو من workflow_requirements.yml."""
    raw = WF_REQ_PATH.read_text(encoding="utf-8") if WF_REQ_PATH.exists() else ""
    data = yaml.safe_load(raw) or {}
    if req_name not in data:
        return False
    del data[req_name]
    with open(WF_REQ_PATH, "w", encoding="utf-8") as f:
        f.write("# workflow_requirements.yml\n\n")
        yaml.dump(data, f, allow_unicode=True, default_flow_style=False, sort_keys=False)
    return True


# ─── Import / Export ZIP ─────────────────────────────────────────────
def export_workflow_zip(
    workflow_json_path: Path,
    intent_name: str,
    intent_snippet: str,
    req_snippet: str,
    export_path: Path,
) -> None:
    """ينشئ ملف ZIP يحتوي على الوركفلو والنية والمتطلبات."""
    with zipfile.ZipFile(export_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(workflow_json_path, workflow_json_path.name)
        zf.writestr("intent.yml", intent_snippet)
        zf.writestr("requirement.yml", req_snippet)
        meta = {
            "intent_name": intent_name,
            "workflow_file": workflow_json_path.name,
        }
        zf.writestr("meta.json", json.dumps(meta, ensure_ascii=False, indent=2))


def import_workflow_zip(
    zip_path: Path,
    target_workflow_dir: Path,
) -> tuple[str, str]:
    """يستورد ملف ZIP: ينسخ الوركفلو ويضيف النية والمتطلبات."""
    with zipfile.ZipFile(zip_path, "r") as zf:
        names = zf.namelist()
        if "meta.json" not in names:
            raise ValueError(t("no_meta"))
        meta = json.loads(zf.read("meta.json"))
        intent_name = meta.get("intent_name", "")
        wf_filename = meta.get("workflow_file", "")
        if not wf_filename:
            raise ValueError(t("no_wf_meta"))

        # نسخ ملف الوركفلو JSON
        if wf_filename in names:
            target_workflow_dir.mkdir(parents=True, exist_ok=True)
            dest = target_workflow_dir / wf_filename
            dest.write_bytes(zf.read(wf_filename))

        # إضافة النية
        if "intent.yml" in names:
            snippet = zf.read("intent.yml").decode("utf-8")
            save_intent_to_file(intent_name, snippet)

        # إضافة المتطلبات
        if "requirement.yml" in names:
            snippet = zf.read("requirement.yml").decode("utf-8")
            save_requirement_to_file(snippet)

    return intent_name, wf_filename


# ─── التطبيق ────────────────────────────────────────────────────────
class BuilderApp:
    # تعريف صفوف الربط: (label, yaml_value)
    ROW_DEFS: list[tuple[str, str]] = [
        ("Positive",      "positive"),
        ("Negative",      "negative"),
        ("Image 1",       "image"),
        ("Image 2",       "image2"),
        ("Image 3",       "image3"),
        ("Video",         "video"),
        ("Video 2",       "video2"),
        ("Audio",         "audio"),
        ("Audio 2",       "audio2"),
        ("Random Num",    "random_num"),
        ("result*text",   "result*text"),
        ("result*image",  "result*image"),
        ("result*video",  "result*video"),
        ("result*audio",  "result*audio"),
    ]

    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title(t("title"))
        self.root.geometry("1050x700")
        self.root.minsize(800, 500)

        self.workflow_path_var = tk.StringVar()
        self.workflow_name_var = tk.StringVar()
        self.intent_name_var = tk.StringVar()
        self.workflow_name_var.trace_add("write", self._sync_intent_name)
        self.aliases_var = tk.StringVar()
        self.no_remove_var = tk.BooleanVar(value=False)
        self.loaded_nodes: dict[str, dict] = {}

        # صفوف الربط الديناميكية (node + key لكل نوع)
        self.mapping_rows: list[dict] = []

        # Save nodes (حتى 3)
        self.save_vars: list[tk.StringVar] = []
        self.save_combos: list[ttk.Combobox] = []
        self._auto_save_nodes: list[str] = []  # كل الصور — auto-detected save nodes

        # Result section
        self.result_node_var = tk.StringVar(value="")
        self.result_kind_var = tk.StringVar(value="")
        self.result_index_var = tk.StringVar(value="0")

        # i18n
        self._i18n: list[tuple[tk.Widget, str]] = []
        self._i18n_frames: list[tuple[tk.LabelFrame, str]] = []
        self._dnd_active = False
        self.lang_var = tk.StringVar(value="en")

        self._build_ui()

    # ─────────────────────────── UI ─────────────────────────────────
    def _build_ui(self) -> None:
        # ════════ كل شيء داخل Canvas واحد قابل للتمرير ════════
        canvas = tk.Canvas(self.root, highlightthickness=0)
        v_scroll = ttk.Scrollbar(self.root, orient="vertical", command=canvas.yview)
        canvas.configure(yscrollcommand=v_scroll.set)
        v_scroll.pack(side="right", fill="y")
        canvas.pack(side="left", fill="both", expand=True)

        inner = tk.Frame(canvas)
        inner_id = canvas.create_window((0, 0), window=inner, anchor="nw")

        def _on_inner_configure(_e: tk.Event) -> None:
            canvas.configure(scrollregion=canvas.bbox("all"))
        def _on_canvas_configure(e: tk.Event) -> None:
            canvas.itemconfig(inner_id, width=e.width)
        inner.bind("<Configure>", _on_inner_configure)
        canvas.bind("<Configure>", _on_canvas_configure)

        # دعم التمرير بالماوس في كل مكان
        def _on_mousewheel(e: tk.Event) -> None:
            canvas.yview_scroll(int(-1 * (e.delta / 120)), "units")
        self.root.bind_all("<MouseWheel>", _on_mousewheel)

        # ── شريط الأدوات العلوي ──
        top = tk.Frame(inner)
        top.pack(fill="x", padx=10, pady=(8, 4))
        top.columnconfigure(1, weight=1)
        tk.Label(top, text="Workflow JSON:").grid(row=0, column=0, sticky="w")
        tk.Entry(top, textvariable=self.workflow_path_var, width=70).grid(
            row=0, column=1, sticky="we", padx=6)
        w = tk.Button(top, text=t("browse"), command=self.pick_file)
        w.grid(row=0, column=2, padx=3); self._i18n.append((w, "browse"))
        w = tk.Button(top, text=t("load"), command=self.load_workflow)
        w.grid(row=0, column=3, padx=3); self._i18n.append((w, "load"))
        # Language selector
        w = tk.Label(top, text=t("lang")); self._i18n.append((w, "lang"))
        w.grid(row=0, column=4, sticky="w", padx=(12, 2))
        self._lang_combo = ttk.Combobox(top, width=10, state="readonly",
                                        values=list(_LANG_NAMES.values()))
        self._lang_combo.set(_LANG_NAMES["en"])
        self._lang_combo.grid(row=0, column=5, padx=3)
        self._lang_combo.bind("<<ComboboxSelected>>", lambda _: self._on_lang_change())

        # ── منطقة السحب والإفلات ──
        self.drop_area = tk.Label(
            inner, text=t("drop_here"),
            bg="#1f2937", fg="white", height=1, relief="ridge", bd=2,
        )
        self.drop_area.pack(fill="x", padx=10, pady=(0, 4))

        # ── صفوف الربط (node + key) ──
        mapping_box = tk.LabelFrame(inner, text=t("mapping"))
        mapping_box.pack(fill="x", padx=10, pady=(0, 4))
        self._i18n_frames.append((mapping_box, "mapping"))

        for i, (label, yaml_val) in enumerate(self.ROW_DEFS):
            nvar = tk.StringVar(value="")
            kvar = tk.StringVar(value="")

            tk.Label(mapping_box, text=label, width=14, anchor="w").grid(
                row=i, column=0, sticky="w", padx=4, pady=1)
            nc = ttk.Combobox(mapping_box, textvariable=nvar, width=34)
            nc.grid(row=i, column=1, sticky="w", padx=3, pady=1)
            kind = yaml_val
            self._make_searchable(nc, nvar,
                                  on_select=lambda k=kind: self._update_key_for_kind(k))

            tk.Label(mapping_box, text="key:", anchor="w").grid(
                row=i, column=2, sticky="w", padx=3, pady=1)
            kc = ttk.Combobox(mapping_box, textvariable=kvar, width=22)
            kc.grid(row=i, column=3, sticky="w", padx=3, pady=1)
            self._make_searchable(kc, kvar)

            self.mapping_rows.append({
                "label": label,
                "kind": yaml_val,
                "node_var": nvar,
                "key_var": kvar,
                "node_combo": nc,
                "key_combo": kc,
            })

        # ── Save nodes (حتى 3 عقد حفظ) ──
        save_frame = tk.LabelFrame(inner, text="Save nodes (save: true)")
        save_frame.pack(fill="x", padx=10, pady=(0, 4))

        for i in range(3):
            sv = tk.StringVar(value="")
            tk.Label(save_frame, text=f"Save {i + 1}", width=8, anchor="w").grid(
                row=0, column=i * 2, sticky="w", padx=4, pady=3)
            sc = ttk.Combobox(save_frame, textvariable=sv, width=28)
            sc.grid(row=0, column=i * 2 + 1, sticky="w", padx=3, pady=3)
            self._make_searchable(sc, sv)
            self.save_vars.append(sv)
            self.save_combos.append(sc)

        # زر "كل الصور" — تعيين save: true لجميع SaveImage/PreviewImage تلقائياً
        auto_row = tk.Frame(save_frame)
        auto_row.grid(row=1, column=0, columnspan=7, sticky="w", padx=4, pady=(0, 3))
        self._all_images_btn = tk.Button(
            auto_row, text=t("all_images"),
            command=self._fill_all_save_nodes,
            bg="#0ea5e9", fg="white", font=("Arial", 9, "bold"),
        )
        self._all_images_btn.pack(side="left", padx=(0, 6))
        self._i18n.append((self._all_images_btn, "all_images"))
        self._clear_auto_btn = tk.Button(
            auto_row, text=t("clear_auto"),
            command=self._clear_auto_save_nodes,
            font=("Arial", 9),
        )
        self._clear_auto_btn.pack(side="left", padx=(0, 8))
        self._i18n.append((self._clear_auto_btn, "clear_auto"))
        self._auto_save_lbl = tk.Label(auto_row, text=t("auto_none"), fg="#555", font=("Arial", 9))
        self._auto_save_lbl.pack(side="left")

        # ── Result section ──
        result_frame = tk.LabelFrame(inner, text=t("result_sec"))
        result_frame.pack(fill="x", padx=10, pady=(0, 4))
        self._i18n_frames.append((result_frame, "result_sec"))

        tk.Label(result_frame, text="Node").grid(row=0, column=0, sticky="w", padx=4, pady=3)
        self.result_node_combo = ttk.Combobox(
            result_frame, textvariable=self.result_node_var, width=28)
        self.result_node_combo.grid(row=0, column=1, sticky="w", padx=3, pady=3)
        self._make_searchable(self.result_node_combo, self.result_node_var)

        tk.Label(result_frame, text="Kind").grid(row=0, column=2, sticky="w", padx=4, pady=3)
        self.result_kind_combo = ttk.Combobox(
            result_frame, textvariable=self.result_kind_var, width=12,
            values=["", "image", "text", "video", "audio"])
        self.result_kind_combo.grid(row=0, column=3, sticky="w", padx=3, pady=3)

        tk.Label(result_frame, text="Index").grid(row=0, column=4, sticky="w", padx=4, pady=3)
        tk.Entry(result_frame, textvariable=self.result_index_var, width=6).grid(
            row=0, column=5, sticky="w", padx=3, pady=3)

        # ── Intent form ──
        form = tk.Frame(inner)
        form.pack(fill="x", padx=10, pady=(4, 0))

        tk.Label(form, text="Workflow / Intent key:").grid(row=0, column=0, sticky="w")
        tk.Entry(form, textvariable=self.workflow_name_var, width=64).grid(
            row=0, column=1, columnspan=3, sticky="we", padx=6)

        tk.Label(form, text="Aliases (comma):").grid(row=1, column=0, sticky="w", pady=(4, 0))
        tk.Entry(form, textvariable=self.aliases_var, width=80).grid(
            row=1, column=1, columnspan=3, sticky="we", padx=6, pady=(4, 0))

        flags_btns = tk.Frame(inner)
        flags_btns.pack(fill="x", padx=10, pady=(4, 2))
        tk.Checkbutton(flags_btns, text="no_remove: true", variable=self.no_remove_var).pack(
            side="left")
        w = tk.Button(flags_btns, text=t("generate"), command=self.generate)
        w.pack(side="left", padx=(20, 4)); self._i18n.append((w, "generate"))
        w = tk.Button(flags_btns, text=t("copy_int"), command=lambda: self.copy_text(self.intent_out))
        w.pack(side="left", padx=4); self._i18n.append((w, "copy_int"))
        w = tk.Button(flags_btns, text=t("copy_req"), command=lambda: self.copy_text(self.req_out))
        w.pack(side="left", padx=4); self._i18n.append((w, "copy_req"))

        # ── أزرار حفظ / حذف ──
        file_btns = tk.Frame(inner)
        file_btns.pack(fill="x", padx=10, pady=(0, 4))
        w = tk.Button(file_btns, text=t("save_files"), command=self.save_to_files,
                  bg="#22c55e", fg="white", font=("Arial", 10, "bold"))
        w.pack(side="left", padx=4); self._i18n.append((w, "save_files"))
        w = tk.Button(file_btns, text=t("delete_sel"), command=self.delete_selected_entry,
                  bg="#ef4444", fg="white", font=("Arial", 10, "bold"))
        w.pack(side="left", padx=4); self._i18n.append((w, "delete_sel"))
        w = tk.Button(file_btns, text=t("refresh"), command=self.refresh_entries_list)
        w.pack(side="left", padx=4); self._i18n.append((w, "refresh"))

        # ── استيراد / تصدير ZIP ──
        zip_btns = tk.Frame(inner)
        zip_btns.pack(fill="x", padx=10, pady=(0, 4))
        w = tk.Button(zip_btns, text=t("exp_zip"), command=self.export_zip,
                  bg="#3b82f6", fg="white", font=("Arial", 10, "bold"))
        w.pack(side="left", padx=4); self._i18n.append((w, "exp_zip"))
        w = tk.Button(zip_btns, text=t("exp_sel"), command=self.export_existing,
                  bg="#0ea5e9", fg="white", font=("Arial", 10, "bold"))
        w.pack(side="left", padx=4); self._i18n.append((w, "exp_sel"))
        w = tk.Button(zip_btns, text=t("imp_zip"), command=self.import_zip,
                  bg="#8b5cf6", fg="white", font=("Arial", 10, "bold"))
        w.pack(side="left", padx=4); self._i18n.append((w, "imp_zip"))

        # ── العناصر المحفوظة حالياً ──
        entries_frame = tk.LabelFrame(inner, text=t("entries"))
        entries_frame.pack(fill="x", padx=10, pady=(0, 4))
        self._i18n_frames.append((entries_frame, "entries"))
        ef = tk.Frame(entries_frame)
        ef.pack(fill="x", padx=4, pady=4)
        ef.columnconfigure(0, weight=1)
        ef.columnconfigure(1, weight=1)

        tk.Label(ef, text="intents.yml:").grid(row=0, column=0, sticky="w")
        i_frame = tk.Frame(ef)
        i_frame.grid(row=1, column=0, sticky="nsew", padx=(0, 4))
        self.intents_listbox = tk.Listbox(i_frame, height=5, exportselection=False)
        i_sb = ttk.Scrollbar(i_frame, orient="vertical", command=self.intents_listbox.yview)
        self.intents_listbox.configure(yscrollcommand=i_sb.set)
        self.intents_listbox.pack(side="left", fill="both", expand=True)
        i_sb.pack(side="right", fill="y")
        self.intents_listbox.bind("<<ListboxSelect>>", lambda _e: self._preview_intent_selection())
        self.intents_listbox.bind("<Double-Button-1>", lambda _e: self._load_intent_for_editing())

        tk.Label(ef, text="workflow_requirements.yml:").grid(row=0, column=1, sticky="w")
        r_frame = tk.Frame(ef)
        r_frame.grid(row=1, column=1, sticky="nsew", padx=(4, 0))
        self.reqs_listbox = tk.Listbox(r_frame, height=5, exportselection=False)
        r_sb = ttk.Scrollbar(r_frame, orient="vertical", command=self.reqs_listbox.yview)
        self.reqs_listbox.configure(yscrollcommand=r_sb.set)
        self.reqs_listbox.pack(side="left", fill="both", expand=True)
        r_sb.pack(side="right", fill="y")
        self.reqs_listbox.bind("<<ListboxSelect>>", lambda _e: self._preview_req_selection())
        self.reqs_listbox.bind("<Double-Button-1>", lambda _e: self._load_req_for_editing())

        self.refresh_entries_list()

        # ── مخرجات (داخل inner — قابلة للتمرير مع الباقي) ──
        outputs = tk.LabelFrame(inner, text=t("output"))
        outputs.pack(fill="x", padx=10, pady=(0, 10))
        self._i18n_frames.append((outputs, "output"))

        out_pane = tk.Frame(outputs)
        out_pane.pack(fill="x", padx=4, pady=4)
        out_pane.columnconfigure(0, weight=1)
        out_pane.columnconfigure(1, weight=1)

        left = tk.Frame(out_pane)
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 4))
        right = tk.Frame(out_pane)
        right.grid(row=0, column=1, sticky="nsew", padx=(4, 0))

        tk.Label(left, text="intents.yml snippet").pack(anchor="w")
        self.intent_out = ScrolledText(left, wrap="none", font=("Consolas", 10), height=10)
        self.intent_out.pack(fill="x", expand=False)

        tk.Label(right, text="workflow_requirements.yml snippet").pack(anchor="w")
        self.req_out = ScrolledText(right, wrap="none", font=("Consolas", 10), height=10)
        self.req_out.pack(fill="x", expand=False)

        self._enable_dnd_if_available()

    # ─────────────────── اقتراحات العقد ─────────────────────────────
    def _node_values(self) -> list[str]:
        return [""] + [
            node_display(nid, self.loaded_nodes[nid])
            for nid in sorted(
                self.loaded_nodes,
                key=lambda x: (0, int(x)) if str(x).isdigit() else (1, str(x)),
            )
        ]

    def _populate_node_suggestions(self) -> None:
        vals = self._node_values()
        for row in self.mapping_rows:
            row["node_combo"]["values"] = vals
            row["node_combo"]._search_all = vals   # type: ignore[attr-defined]
        for sc in self.save_combos:
            sc["values"] = vals
            sc._search_all = vals                  # type: ignore[attr-defined]
        self.result_node_combo["values"] = vals
        self.result_node_combo._search_all = vals  # type: ignore[attr-defined]

    def _get_node_input_keys(self, selection: str) -> list[str]:
        node_id = parse_node_id(selection)
        if not node_id:
            return []
        node = self.loaded_nodes.get(node_id, {})
        inputs = node.get("inputs", {}) if isinstance(node, dict) else {}
        if not isinstance(inputs, dict):
            return []
        keys = [str(k) for k in inputs.keys()]

        # بعض عقد ComfyUI (مثل LoadAudio) تحفظ مفاتيح واجهة (audioUI)
        # بينما التحقق الداخلي يتطلب مفتاحًا منطقيًا ثابتًا (audio).
        try:
            class_type = str(node.get("class_type", ""))
        except Exception:
            class_type = ""
        if class_type == "LoadAudio" and "audio" not in keys:
            keys.append("audio")

        return keys

    def _update_key_for_kind(self, kind: str) -> None:
        for row in self.mapping_rows:
            if row["kind"] == kind:
                keys = [""] + self._get_node_input_keys(row["node_var"].get())
                row["key_combo"]["values"] = keys
                row["key_combo"]._search_all = keys  # type: ignore[attr-defined]
                row["key_var"].set("")
                break

    # ───────── كل الصور — auto-detect SaveImage / PreviewImage ─────────
    def _fill_all_save_nodes(self) -> None:
        """تعيين save: true تلقائياً لجميع عقد SaveImage و PreviewImage في الوركفلو المحمّل."""
        if not self.loaded_nodes:
            messagebox.showwarning(t("warning"), t("choose_wf"))
            return
        found: list[str] = [
            nid for nid, node in self.loaded_nodes.items()
            if str(node.get("class_type", "")).lower() in SAVE_CLASS_HINTS
        ]
        found.sort(key=lambda x: (0, int(x)) if x.isdigit() else (1, x))
        self._auto_save_nodes = found
        if found:
            self._auto_save_lbl.config(
                text=t("auto_found", n=len(found), ids=", ".join(found)), fg="#0ea5e9"
            )
        else:
            self._auto_save_lbl.config(text=t("auto_empty"), fg="#ef4444")

    def _clear_auto_save_nodes(self) -> None:
        """مسح قائمة العقد التلقائية."""
        self._auto_save_nodes = []
        self._auto_save_lbl.config(text=t("auto_none"), fg="#555")

    # ───────────────── تجميع المدخلات ───────────────────────────────
    def _collect_manual_requirements(self) -> tuple[list[tuple[str, str, str]], list[str]]:
        mappings: list[tuple[str, str, str]] = []
        save_nodes: list[str] = []

        for row in self.mapping_rows:
            nid = parse_node_id(row["node_var"].get())
            key = row["key_var"].get().strip()
            if nid and key:
                mappings.append((nid, key, row["kind"]))

        for sv in self.save_vars:
            sid = parse_node_id(sv.get())
            if sid:
                save_nodes.append(sid)

        # دمج العقد التلقائية (كل الصور)
        save_nodes.extend(self._auto_save_nodes)

        # إزالة التكرارات مع الحفاظ على الترتيب
        seen_m: set[tuple[str, str, str]] = set()
        uniq_m: list[tuple[str, str, str]] = []
        for m in mappings:
            if m not in seen_m:
                seen_m.add(m)
                uniq_m.append(m)
        save_nodes = list(dict.fromkeys(save_nodes))

        return uniq_m, save_nodes

    # ────────────────── البحث داخل الـ Combobox ─────────────────────
    def _make_searchable(
        self,
        combo: ttk.Combobox,
        var: tk.StringVar,
        on_select: "callable | None" = None,
    ) -> None:
        """يجعل الكومبوبوكس قابلاً للبحث بالكتابة مع فلترة فورية بدون فقد التركيز."""
        combo._search_all = []   # type: ignore[attr-defined]
        combo._popup = None      # type: ignore[attr-defined]

        def _destroy_popup() -> None:
            pw = getattr(combo, "_popup", None)
            if pw and pw.winfo_exists():
                pw.destroy()
            combo._popup = None  # type: ignore[attr-defined]

        def _show_popup(filtered: list[str]) -> None:
            _destroy_popup()
            if not filtered:
                return

            popup = tk.Toplevel(combo)
            popup.wm_overrideredirect(True)
            popup.wm_attributes("-topmost", True)
            combo._popup = popup  # type: ignore[attr-defined]

            x = combo.winfo_rootx()
            y = combo.winfo_rooty() + combo.winfo_height()
            w = combo.winfo_width()
            h = min(len(filtered), 8) * 20
            popup.wm_geometry(f"{w}x{h}+{x}+{y}")

            lb = tk.Listbox(popup, exportselection=False, activestyle="none",
                            borderwidth=1, relief="solid")
            lb.pack(fill="both", expand=True)
            for item in filtered:
                lb.insert(tk.END, item)

            def _pick(event: tk.Event) -> None:
                sel = lb.curselection()
                if sel:
                    var.set(lb.get(sel[0]))
                _destroy_popup()
                combo["values"] = getattr(combo, "_search_all", [])
                combo.focus_set()
                combo.icursor(tk.END)
                if on_select:
                    on_select()

            lb.bind("<ButtonRelease-1>", _pick)

        def _filter(event: tk.Event) -> None:
            if event.keysym == "Return":
                _destroy_popup()
                combo["values"] = getattr(combo, "_search_all", [])
                if on_select:
                    on_select()
                return
            if event.keysym == "Escape":
                _destroy_popup()
                return
            if event.keysym in ("Tab",):
                _destroy_popup()
                return
            if event.keysym in ("Up", "Down"):
                return

            typed = var.get().strip().lower()
            all_vals: list[str] = getattr(combo, "_search_all", [])
            filtered = [v for v in all_vals if typed in v.lower()] if typed else all_vals
            combo["values"] = filtered
            _show_popup(filtered)

        def _on_selected(event: tk.Event) -> None:
            _destroy_popup()
            combo["values"] = getattr(combo, "_search_all", [])
            if on_select:
                on_select()

        def _on_focus_out(event: tk.Event) -> None:
            combo.after(150, _destroy_popup)

        combo.bind("<KeyRelease>", _filter)
        combo.bind("<<ComboboxSelected>>", _on_selected)
        combo.bind("<FocusOut>", _on_focus_out)

    # ────────────────── DnD ─────────────────────────────────────────
    def _enable_dnd_if_available(self) -> None:
        if TkinterDnD is None or DND_FILES is None:
            self._dnd_active = False
            self.drop_area.configure(text=t("dnd_off"))
            return
        self._dnd_active = True
        self.drop_area.drop_target_register(DND_FILES)
        self.drop_area.dnd_bind("<<Drop>>", self._on_drop)

    def _on_drop(self, event) -> None:
        self.workflow_path_var.set(parse_dnd_path(event.data))
        self.load_workflow()

    # ────────────────── Language switching ───────────────────────────
    def _on_lang_change(self) -> None:
        global _current_lang
        display = self._lang_combo.get()
        for code, name in _LANG_NAMES.items():
            if name == display:
                _current_lang = code
                break
        self._apply_language()

    def _apply_language(self) -> None:
        self.root.title(t("title"))
        is_rtl = _current_lang == "ar"
        anchor = "ne" if is_rtl else "nw"
        # Widgets
        for widget, key in self._i18n:
            try:
                widget.configure(text=t(key))
            except Exception:
                pass
        # LabelFrames
        for frame, key in self._i18n_frames:
            try:
                frame.configure(text=t(key), labelanchor=anchor)
            except Exception:
                pass
        # Drop area
        if self._dnd_active:
            self.drop_area.configure(text=t("drop_here"))
        else:
            self.drop_area.configure(text=t("dnd_off"))

    def _sync_intent_name(self, *_) -> None:
        """يجعل intent_name_var دائماً مساوياً لـ workflow_name_var."""
        self.intent_name_var.set(self.workflow_name_var.get())

    def pick_file(self) -> None:
        path = filedialog.askopenfilename(
            title="Choose ComfyUI API workflow JSON",
            filetypes=[("JSON files", "*.json"), ("All files", "*.*")],
        )
        if path:
            self.workflow_path_var.set(path)

    # ────────────────── تحميل الوركفلو ──────────────────────────────
    def load_workflow(self, notify: bool = True) -> None:
        raw = self.workflow_path_var.get().strip()
        if not raw:
            if notify:
                messagebox.showwarning(t("warning"), t("choose_wf"))
            return
        path = Path(raw)
        if not path.exists():
            if notify:
                messagebox.showerror(t("error"), t("not_found"))
            return
        try:
            nodes = load_workflow_api_json(path)
        except Exception as ex:
            if notify:
                messagebox.showerror(t("error"), str(ex))
            return

        stem = normalize_name(path.stem)
        self.workflow_name_var.set(stem)
        if not self.aliases_var.get().strip():
            self.aliases_var.set(stem)

        self.loaded_nodes = nodes
        self._populate_node_suggestions()

        # تفريغ كل الحقول
        for row in self.mapping_rows:
            row["node_var"].set("")
            row["key_var"].set("")
            row["key_combo"]["values"] = [""]
            row["key_combo"]._search_all = [""]  # type: ignore[attr-defined]
        for sv in self.save_vars:
            sv.set("")
        self.result_node_var.set("")
        self.result_kind_var.set("")
        self.result_index_var.set("0")

        # عرض مبدئي فارغ
        self.req_out.delete("1.0", tk.END)
        self.req_out.insert("1.0", ltr_yaml(build_requirements_yaml(stem, [], [])))
        self.intent_out.delete("1.0", tk.END)
        self.intent_out.insert(
            "1.0",
            ltr_yaml(build_intent_yaml(stem, path.name, [stem], self.no_remove_var.get())),
        )
        if notify:
            messagebox.showinfo(t("success"), t("loaded"))

    def _clear_form_mappings(self) -> None:
        for row in self.mapping_rows:
            row["node_var"].set("")
            row["key_var"].set("")
            row["key_combo"]["values"] = [""]
            row["key_combo"]._search_all = [""]  # type: ignore[attr-defined]
        for sv in self.save_vars:
            sv.set("")
        self.result_node_var.set("")
        self.result_kind_var.set("")
        self.result_index_var.set("0")

    def _find_workflow_json_path(self, wf_filename: str) -> Path | None:
        wf_filename = (wf_filename or "").strip()
        if not wf_filename:
            return None
        for d in WORKFLOWS_DIR.rglob(wf_filename):
            return d
        candidate = PROJECT_ROOT / wf_filename
        if candidate.exists():
            return candidate
        return None

    def _apply_intent_entry_to_form(self, name: str, entry: dict) -> None:
        wf_file = entry.get("file", "") or ""
        self.workflow_name_var.set(name)
        self.no_remove_var.set(bool(entry.get("no_remove", False)))
        aliases = entry.get("aliases", [])
        if isinstance(aliases, list):
            self.aliases_var.set(", ".join(str(a) for a in aliases))
        snippet = build_intent_yaml(
            name, wf_file,
            [str(a) for a in aliases] if isinstance(aliases, list) else [name],
            bool(entry.get("no_remove", False)),
        )
        self.intent_out.delete("1.0", tk.END)
        self.intent_out.insert("1.0", ltr_yaml(snippet))

    def _apply_req_entry_to_form(self, name: str, entry: dict) -> None:
        self.workflow_name_var.set(name)
        self._clear_form_mappings()

        nodes = entry.get("nodes", {})
        if isinstance(nodes, dict):
            save_idx = 0
            for nid, spec in nodes.items():
                if not isinstance(spec, dict):
                    continue
                if spec.get("save") or spec.get("is_result"):
                    if save_idx < len(self.save_vars):
                        self.save_vars[save_idx].set(str(nid))
                        save_idx += 1
                inputs = spec.get("inputs", {})
                if isinstance(inputs, dict):
                    for inp_key, action in inputs.items():
                        if not isinstance(action, str):
                            continue
                        for row in self.mapping_rows:
                            if row["kind"] == action and not row["node_var"].get():
                                row["node_var"].set(str(nid))
                                self._update_key_for_kind(row["kind"])
                                row["key_var"].set(str(inp_key))
                                break

        result = entry.get("result", {})
        if isinstance(result, dict):
            self.result_node_var.set(str(result.get("node", "")))
            self.result_kind_var.set(str(result.get("kind", "")))
            self.result_index_var.set(str(result.get("index", "0")))

        snippet = yaml.dump({name: entry}, allow_unicode=True, default_flow_style=False, sort_keys=False)
        self.req_out.delete("1.0", tk.END)
        self.req_out.insert("1.0", ltr_yaml(snippet))

    def _preview_entry_selection(self, name: str) -> None:
        if not name:
            return

        intent_entry = None
        req_entry = None
        wf_file = ""
        try:
            intent_data = yaml.safe_load(INTENTS_PATH.read_text(encoding="utf-8")) or {}
            intent_entry = (intent_data.get("intents") or {}).get(name)
            if isinstance(intent_entry, dict):
                wf_file = intent_entry.get("file", "") or ""
        except Exception:
            intent_entry = None

        try:
            req_data = yaml.safe_load(WF_REQ_PATH.read_text(encoding="utf-8")) or {}
            req_entry = req_data.get(name)
        except Exception:
            req_entry = None

        wf_path = self._find_workflow_json_path(wf_file) if wf_file else None
        if wf_path:
            self.workflow_path_var.set(str(wf_path))
            self.load_workflow(notify=False)

        if isinstance(intent_entry, dict):
            self._apply_intent_entry_to_form(name, intent_entry)
        if isinstance(req_entry, dict):
            self._apply_req_entry_to_form(name, req_entry)

    def _preview_intent_selection(self) -> None:
        sel = self.intents_listbox.curselection()
        if not sel:
            return
        name = self.intents_listbox.get(sel[0])
        self._preview_entry_selection(name)

    def _preview_req_selection(self) -> None:
        sel = self.reqs_listbox.curselection()
        if not sel:
            return
        name = self.reqs_listbox.get(sel[0])
        self._preview_entry_selection(name)

    # ────────────────── التوليد ──────────────────────────────────────
    def generate(self) -> None:
        raw = self.workflow_path_var.get().strip()
        if not raw:
            messagebox.showwarning(t("warning"), t("choose_wf"))
            return
        path = Path(raw)
        try:
            load_workflow_api_json(path)
        except Exception as ex:
            messagebox.showerror(t("error"), str(ex))
            return

        workflow_name = normalize_name(self.workflow_name_var.get() or path.stem)
        intent_name = normalize_name(self.intent_name_var.get() or workflow_name)
        aliases = [a.strip() for a in self.aliases_var.get().split(",") if a.strip()]

        mappings, save_nodes = self._collect_manual_requirements()

        result_node = parse_node_id(self.result_node_var.get())
        result_kind = self.result_kind_var.get().strip()
        result_index = self.result_index_var.get().strip()

        req_text = build_requirements_yaml(
            workflow_name, mappings, save_nodes,
            result_node, result_kind, result_index,
        )
        intent_text = build_intent_yaml(
            intent_name, path.name, aliases, self.no_remove_var.get(),
        )

        self.intent_out.delete("1.0", tk.END)
        self.intent_out.insert("1.0", ltr_yaml(intent_text))
        self.req_out.delete("1.0", tk.END)
        self.req_out.insert("1.0", ltr_yaml(req_text))

    def save_to_files(self) -> None:
        """يحفظ النية والمتطلبات مباشرة في الملفات الأصلية."""
        intent_text = self.intent_out.get("1.0", tk.END).strip().replace("\u200e", "")
        req_text = self.req_out.get("1.0", tk.END).strip().replace("\u200e", "")
        if not intent_text and not req_text:
            messagebox.showwarning(t("warning"), t("gen_first"))
            return

        intent_name = normalize_name(self.intent_name_var.get())
        confirm = messagebox.askyesno(
            t("confirm_save"),
            t("save_q", name=intent_name, f1=INTENTS_PATH.name, f2=WF_REQ_PATH.name),
        )
        if not confirm:
            return

        errors: list[str] = []
        if intent_text:
            try:
                save_intent_to_file(intent_name, intent_text)
            except Exception as ex:
                errors.append(f"intents.yml: {ex}")
        if req_text:
            try:
                save_requirement_to_file(req_text)
            except Exception as ex:
                errors.append(f"workflow_requirements.yml: {ex}")

        if errors:
            messagebox.showerror(t("errors"), "\n".join(errors))
        else:
            messagebox.showinfo(t("success"), t("saved_ok", name=intent_name))
            self.refresh_entries_list()

    def delete_selected_entry(self) -> None:
        """يحذف العنصر المحدد من القوائم."""
        i_sel = self.intents_listbox.curselection()
        r_sel = self.reqs_listbox.curselection()
        if not i_sel and not r_sel:
            messagebox.showwarning(t("pick_item"), t("pick_del"))
            return

        names: list[str] = []
        if i_sel:
            names.append(f"Intent: {self.intents_listbox.get(i_sel[0])}")
        if r_sel:
            names.append(f"Requirement: {self.reqs_listbox.get(r_sel[0])}")

        confirm = messagebox.askyesno(
            t("confirm_del"),
            t("del_q", items="\n".join(names)),
        )
        if not confirm:
            return

        errors: list[str] = []
        if i_sel:
            name = self.intents_listbox.get(i_sel[0])
            try:
                if not delete_intent_from_file(name):
                    errors.append(f"Intent '{name}' غير موجود.")
            except Exception as ex:
                errors.append(f"intents.yml: {ex}")
        if r_sel:
            name = self.reqs_listbox.get(r_sel[0])
            try:
                if not delete_requirement_from_file(name):
                    errors.append(f"Requirement '{name}' غير موجود.")
            except Exception as ex:
                errors.append(f"workflow_requirements.yml: {ex}")

        if errors:
            messagebox.showerror(t("errors"), "\n".join(errors))
        else:
            messagebox.showinfo(t("success"), t("deleted"))
        self.refresh_entries_list()

    # ──────────────── Export ZIP ───────────────────────────────
    def export_zip(self) -> None:
        """يصدّر الوركفلو مع النية والمتطلبات كملف ZIP."""
        wf_raw = self.workflow_path_var.get().strip()
        if not wf_raw:
            messagebox.showwarning(t("warning"), t("choose_wf"))
            return
        wf_path = Path(wf_raw)
        if not wf_path.exists():
            messagebox.showerror(t("error"), t("wf_missing"))
            return

        intent_text = self.intent_out.get("1.0", tk.END).strip().replace("\u200e", "")
        req_text = self.req_out.get("1.0", tk.END).strip().replace("\u200e", "")
        if not intent_text and not req_text:
            messagebox.showwarning(t("warning"), t("gen_export"))
            return

        intent_name = normalize_name(self.intent_name_var.get())

        dest = filedialog.asksaveasfilename(
            title=t("save_zip"),
            defaultextension=".zip",
            initialfile=f"{intent_name}.zip",
            filetypes=[("ZIP files", "*.zip"), ("All files", "*.*")],
        )
        if not dest:
            return

        try:
            export_workflow_zip(
                wf_path, intent_name, intent_text, req_text, Path(dest),
            )
            messagebox.showinfo(t("exported"), t("exp_msg", name=intent_name, path=dest))
        except Exception as ex:
            messagebox.showerror(t("error"), str(ex))

    def export_existing(self) -> None:
        """يصدّر عنصراً محفوظاً من القوائم كملف ZIP."""
        # تحديد العنصر المحدد
        i_sel = self.intents_listbox.curselection()
        r_sel = self.reqs_listbox.curselection()

        name = ""
        if i_sel:
            name = self.intents_listbox.get(i_sel[0])
        elif r_sel:
            name = self.reqs_listbox.get(r_sel[0])

        if not name:
            messagebox.showwarning(t("pick_item"), t("pick_exp"))
            return

        # قراءة بيانات النية
        intent_snippet = ""
        wf_filename = ""
        try:
            idata = yaml.safe_load(INTENTS_PATH.read_text(encoding="utf-8")) or {}
            entry = (idata.get("intents") or {}).get(name)
            if entry and isinstance(entry, dict):
                wf_filename = entry.get("file", "") or ""
                intent_snippet = yaml.dump(
                    {name: entry}, allow_unicode=True,
                    default_flow_style=False, sort_keys=False,
                )
        except Exception:
            pass

        # قراءة بيانات المتطلبات
        req_snippet = ""
        try:
            rdata = yaml.safe_load(WF_REQ_PATH.read_text(encoding="utf-8")) or {}
            rentry = rdata.get(name)
            if rentry and isinstance(rentry, dict):
                req_snippet = yaml.dump(
                    {name: rentry}, allow_unicode=True,
                    default_flow_style=False, sort_keys=False,
                )
        except Exception:
            pass

        if not intent_snippet and not req_snippet:
            messagebox.showwarning(t("warning"), t("no_data", name=name))
            return

        # البحث عن ملف الوركفلو JSON في مجلدات workflows
        wf_path: Path | None = None
        if wf_filename:
            for d in WORKFLOWS_DIR.rglob(wf_filename):
                wf_path = d
                break
            # بحث في جذر المشروع أيضاً
            if not wf_path:
                candidate = PROJECT_ROOT / wf_filename
                if candidate.exists():
                    wf_path = candidate

        # اختيار مكان الحفظ
        dest = filedialog.asksaveasfilename(
            title=t("save_zip"),
            defaultextension=".zip",
            initialfile=f"{name}.zip",
            filetypes=[("ZIP files", "*.zip"), ("All files", "*.*")],
        )
        if not dest:
            return

        try:
            with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:
                # ملف الوركفلو
                if wf_path and wf_path.exists():
                    zf.write(wf_path, wf_path.name)
                # intent snippet
                if intent_snippet:
                    zf.writestr("intent.yml", intent_snippet)
                # requirement snippet
                if req_snippet:
                    zf.writestr("requirement.yml", req_snippet)
                # meta
                meta = {
                    "intent_name": name,
                    "workflow_file": wf_filename or "",
                }
                zf.writestr("meta.json", json.dumps(meta, ensure_ascii=False, indent=2))

            parts = [t("exp_ok", name=name)]
            if wf_path and wf_path.exists():
                parts.append(t("wf_ok", f=wf_filename))
            elif wf_filename:
                parts.append(t("wf_no", f=wf_filename))
            messagebox.showinfo(t("exported"), "\n".join(parts))
        except Exception as ex:
            messagebox.showerror(t("error"), str(ex))

    # ──────────────── Import ZIP ───────────────────────────────
    def import_zip(self) -> None:
        """يستورد ملف ZIP ويضيف الوركفلو والنية والمتطلبات."""
        zip_path = filedialog.askopenfilename(
            title=t("pick_zip"),
            filetypes=[("ZIP files", "*.zip"), ("All files", "*.*")],
        )
        if not zip_path:
            return

        wf_dir = filedialog.askdirectory(
            title=t("pick_dir"),
            initialdir=str(WORKFLOWS_DIR),
        )
        if not wf_dir:
            return

        try:
            intent_name, wf_file = import_workflow_zip(
                Path(zip_path), Path(wf_dir),
            )
            self.refresh_entries_list()
            messagebox.showinfo(
                t("imported"),
                t("imp_msg", name=intent_name, f=wf_file, d=wf_dir),
            )
        except Exception as ex:
            messagebox.showerror(t("error"), str(ex))

    def _load_intent_for_editing(self) -> None:
        """يحمّل نيّة محفوظة في حقول النموذج للتعديل."""
        sel = self.intents_listbox.curselection()
        if not sel:
            return
        name = self.intents_listbox.get(sel[0])
        try:
            data = yaml.safe_load(INTENTS_PATH.read_text(encoding="utf-8")) or {}
            entry = (data.get("intents") or {}).get(name)
            if not entry or not isinstance(entry, dict):
                return
        except Exception:
            return

        self.workflow_name_var.set(name)  # intent_name_var يتزامن تلقائياً
        wf_file = entry.get("file", "") or ""
        self.no_remove_var.set(bool(entry.get("no_remove", False)))
        aliases = entry.get("aliases", [])
        if isinstance(aliases, list):
            self.aliases_var.set(", ".join(str(a) for a in aliases))

        # عرض الـ snippet في منطقة المخرجات
        snippet = build_intent_yaml(
            name, wf_file or "",
            [str(a) for a in aliases] if isinstance(aliases, list) else [name],
            bool(entry.get("no_remove", False)),
        )
        self.intent_out.delete("1.0", tk.END)
        self.intent_out.insert("1.0", ltr_yaml(snippet))

        # عرض snippet المتطلبات/الوركفلو المطابق في صندوق المخرجات الثاني أيضاً
        req_snippet = ""
        try:
            req_data = yaml.safe_load(WF_REQ_PATH.read_text(encoding="utf-8")) or {}
            req_entry = req_data.get(name)
            if req_entry and isinstance(req_entry, dict):
                req_snippet = yaml.dump(
                    {name: req_entry},
                    allow_unicode=True,
                    default_flow_style=False,
                    sort_keys=False,
                )
        except Exception:
            req_snippet = ""

        self.req_out.delete("1.0", tk.END)
        if req_snippet:
            self.req_out.insert("1.0", ltr_yaml(req_snippet))

        messagebox.showinfo(t("success"), t("load_edit", name=name))

    def _load_req_for_editing(self) -> None:
        """يحمّل متطلبات وركفلو محفوظة في حقول النموذج للتعديل."""
        sel = self.reqs_listbox.curselection()
        if not sel:
            return
        name = self.reqs_listbox.get(sel[0])
        try:
            data = yaml.safe_load(WF_REQ_PATH.read_text(encoding="utf-8")) or {}
            entry = data.get(name)
            if not entry or not isinstance(entry, dict):
                return
        except Exception:
            return

        self.workflow_name_var.set(name)  # intent_name_var يتزامن تلقائياً

        # تفريغ كل الحقول
        for row in self.mapping_rows:
            row["node_var"].set("")
            row["key_var"].set("")
        for sv in self.save_vars:
            sv.set("")
        self.result_node_var.set("")
        self.result_kind_var.set("")
        self.result_index_var.set("0")

        # تعبئة الحقول من البيانات المحفوظة
        nodes = entry.get("nodes", {})
        if isinstance(nodes, dict):
            save_idx = 0
            for nid, spec in nodes.items():
                if not isinstance(spec, dict):
                    continue
                # save node
                if spec.get("save") or spec.get("is_result"):
                    if save_idx < len(self.save_vars):
                        self.save_vars[save_idx].set(str(nid))
                        save_idx += 1
                # input mappings
                inputs = spec.get("inputs", {})
                if isinstance(inputs, dict):
                    for inp_key, action in inputs.items():
                        if not isinstance(action, str):
                            continue
                        for row in self.mapping_rows:
                            if row["kind"] == action and not row["node_var"].get():
                                row["node_var"].set(str(nid))
                                row["key_var"].set(str(inp_key))
                                break

        # result section
        result = entry.get("result", {})
        if isinstance(result, dict):
            self.result_node_var.set(str(result.get("node", "")))
            self.result_kind_var.set(str(result.get("kind", "")))
            self.result_index_var.set(str(result.get("index", "0")))

        # عرض YAML الحالي في منطقة المخرجات
        snippet = yaml.dump({name: entry}, allow_unicode=True, default_flow_style=False, sort_keys=False)
        self.req_out.delete("1.0", tk.END)
        self.req_out.insert("1.0", ltr_yaml(snippet))

        # عرض snippet النية المطابقة في صندوق المخرجات الأول أيضاً
        intent_snippet = ""
        try:
            intent_data = yaml.safe_load(INTENTS_PATH.read_text(encoding="utf-8")) or {}
            intent_entry = (intent_data.get("intents") or {}).get(name)
            if intent_entry and isinstance(intent_entry, dict):
                wf_file = intent_entry.get("file", "") or ""
                aliases = intent_entry.get("aliases", [])
                intent_snippet = build_intent_yaml(
                    name,
                    wf_file,
                    [str(a) for a in aliases] if isinstance(aliases, list) else [name],
                    bool(intent_entry.get("no_remove", False)),
                )
                self.no_remove_var.set(bool(intent_entry.get("no_remove", False)))
                if isinstance(aliases, list):
                    self.aliases_var.set(", ".join(str(a) for a in aliases))
        except Exception:
            intent_snippet = ""

        self.intent_out.delete("1.0", tk.END)
        if intent_snippet:
            self.intent_out.insert("1.0", ltr_yaml(intent_snippet))

        messagebox.showinfo(t("success"), t("load_edit", name=name))

    def refresh_entries_list(self) -> None:
        """يحدّث قوائم العناصر المحفوظة."""
        self.intents_listbox.delete(0, tk.END)
        self.reqs_listbox.delete(0, tk.END)
        intent_keys, req_keys = load_existing_entries()
        for k in intent_keys:
            self.intents_listbox.insert(tk.END, k)
        for k in req_keys:
            self.reqs_listbox.insert(tk.END, k)

    def copy_text(self, widget: ScrolledText) -> None:
        text = widget.get("1.0", tk.END).strip().replace("\u200e", "")
        if not text:
            return
        self.root.clipboard_clear()
        self.root.clipboard_append(text)
        self.root.update_idletasks()
        messagebox.showinfo(t("success"), t("copied"))


# ─── main ────────────────────────────────────────────────────────────
def main() -> None:
    if TkinterDnD is not None:
        root = TkinterDnD.Tk()
    else:
        root = tk.Tk()
    BuilderApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
