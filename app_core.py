from typing import List, Optional
# -*- coding: utf-8 -*-
"""
خادم واجهة Comfy Chat (FastAPI)

الوظائف:
- استقبال نص / صور / فيديو / صوت / أوامر من فرونت إند.
- تصنيف النية (intents) باستخدام zero-shot أو alias.
- اختيار workflow (Main/Fast/High) وتنفيذ تعديلات على graph.
- إرسال إلى ComfyUI واستلام الصورة الناتجة.
- تفعيل دعم قوالب (templates) مع مجلدات (عمق 1) + أيقونة مجلد باسم icon.* تُستبعد من الأبناء.
- دعم المستخدمين وسجل المحادثات
- (جديد) تسجيل مسارات الوسائط + comfy_path.txt + حذف كل الوسائط للمستخدم
- (جديد) تضمين used_payload في رد /chat وفي سجل الرسائل لكي يعمل زر ⟳ بعد استعادة الجلسة
"""

import os
import re
import json
import random
import uuid
import time
import base64
import yaml
import logging
import io
import sys
import glob
import subprocess
from pathlib import Path
from typing import List, Tuple, Dict, Any, Optional
from datetime import datetime
import shutil

import requests
import uvicorn
from fastapi import FastAPI, Request, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from PIL import Image, ImageOps

from transformers import pipeline, AutoTokenizer
import torch
from fastapi.responses import JSONResponse


def _load_runtime_env_file() -> None:
    """Load key=value pairs from .easyui.env into process env if not already set."""
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".easyui.env")
    if not os.path.isfile(env_path):
        return
    try:
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                s = line.strip()
                if not s or s.startswith("#") or "=" not in s:
                    continue
                k, v = s.split("=", 1)
                key = k.strip()
                val = v.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = val
    except Exception as e:
        logging.warning("Failed to load .easyui.env: %s", e)


_load_runtime_env_file()

# ————— إعداد اللوج —————
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)

# ————— المسارات —————
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, "web")
EASY_TAG_DIR = os.path.join(WEB_DIR, "easy-tag")
WILDCARD_DIR = os.path.join(EASY_TAG_DIR, "wildcards")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")
WORKF_DIRS = {
    "Main": os.path.join(BASE_DIR, "workflows", "main"),
    "Fast": os.path.join(BASE_DIR, "workflows", "fast"),
    "High": os.path.join(BASE_DIR, "workflows", "high"),
}
COMFY_INPUT_DIR = os.path.join(BASE_DIR, "input_files")
COMFY_OUTPUT_DIR = os.path.join(BASE_DIR, "output")
USERS_DIR = os.path.join(BASE_DIR, "users")
PLUGINS_DIR = os.path.join(BASE_DIR, "plugins")

os.makedirs(COMFY_INPUT_DIR, exist_ok=True)
os.makedirs(COMFY_OUTPUT_DIR, exist_ok=True)
os.makedirs(USERS_DIR, exist_ok=True)
os.makedirs(PLUGINS_DIR, exist_ok=True)

# --- comfy_path.txt (جديد): محاولة اكتشاف مسار ComfyUI الأصلي للحذف لاحقًا ---
COMFY_HINT_ROOT: Optional[str] = None
COMFY_HINT_OUTPUT: Optional[str] = None
COMFY_HINT_TEMP: Optional[str] = None

def _read_comfy_path_hint() -> None:
    """يقرأ comfy_path.txt (إما مجلد root أو مجلد output) لضبط أدلة التلميح."""
    global COMFY_HINT_ROOT, COMFY_HINT_OUTPUT, COMFY_HINT_TEMP
    try:
        hint_file = os.path.join(BASE_DIR, "comfy_path.txt")
        if not os.path.isfile(hint_file):
            return
        raw = ""
        with open(hint_file, "r", encoding="utf-8") as f:
            for line in f:
                s = line.strip().strip('"').strip("'")
                if s:
                    raw = s
                    break
        if not raw:
            return
        p = os.path.normpath(raw)
        if os.path.basename(p).lower() == "output":
            COMFY_HINT_OUTPUT = p
            root = os.path.dirname(p)
            COMFY_HINT_ROOT = root if root else None
            COMFY_HINT_TEMP = os.path.join(root, "temp") if root else None
        else:
            COMFY_HINT_ROOT = p
            COMFY_HINT_OUTPUT = os.path.join(p, "output")
            COMFY_HINT_TEMP = os.path.join(p, "temp")
        logging.info("Comfy hint set. root=%s | output=%s | temp=%s", COMFY_HINT_ROOT, COMFY_HINT_OUTPUT, COMFY_HINT_TEMP)
    except Exception as e:
        logging.warning("تعذر قراءة comfy_path.txt: %s", e)

_read_comfy_path_hint()

# --- وايلدكارد: استبدال __Name__ بنص عشوائي من web/easy-tag/wildcards/Name.txt ---
WC_NAME_RE = re.compile(r"__([A-Za-z0-9_\-\u0600-\u06FF]+)__")

def _load_wildcard_lines(name: str) -> List[str]:
    """يقرأ web/easy-tag/wildcards/<name>.txt ويعيد أسطر غير فارغة (بدون التعليقات #)."""
    try:
        path = os.path.join(WILDCARD_DIR, f"{name}.txt")
        if not os.path.isfile(path):
            return []
        lines: List[str] = []
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                s = line.strip()
                if not s or s.startswith("#"):
                    continue
                lines.append(s)
        return lines
    except Exception as e:
        logging.warning("تعذر قراءة وايلدكارد %s: %s", name, e)
        return []

def replace_wildcards_in_text(text: str, max_passes: int = 3) -> str:
    """يستبدل __name__ بسطر عشوائي من ملف wildcards/name.txt. يدعم تكرار محدود للتوسعة المتداخلة."""
    if not text:
        return text

    prev = None
    cur = text

    for _ in range(max_passes):
        if prev == cur:
            break
        prev = cur

        def _repl(m: re.Match) -> str:
            name = m.group(1)
            lines = _load_wildcard_lines(name)
            if not lines:
                return m.group(0)  # اتركه كما هو إذا لم يوجد ملف
            return random.choice(lines)

        cur = WC_NAME_RE.sub(_repl, cur)

    return cur


# ————— تحميل ملف المتطلبات YAML —————
WF_REQ_PATH = os.path.join(BASE_DIR, "workflow_requirements.yml")
with open(WF_REQ_PATH, encoding="utf-8") as f:
    WORKFLOW_REQUIREMENTS = yaml.safe_load(f)

# ————— تحميل النوايا والـ aliases —————
intents_cfg_path = os.path.join(BASE_DIR, "intents.yml")
intents_cfg = yaml.safe_load(open(intents_cfg_path, encoding="utf-8"))
INTENTS_LOOKUP = intents_cfg["intents"]
INTENTS = list(INTENTS_LOOKUP.keys())
ALIASES_LOOKUP = {
    intent: [alias.strip().lower() for alias in data["aliases"]]
    for intent, data in INTENTS_LOOKUP.items()
}
# قائمة مسطحة مرتبة من الأطول للأقصر — يمنع تطابق "remove" قبل "remove background"
FLAT_ALIASES = sorted(
    [(a, intent) for intent, aliases in ALIASES_LOOKUP.items() for a in aliases],
    key=lambda x: len(x[0]), reverse=True
)

# ————— كلمات التنقية —————
bad_words_path = os.path.join(BASE_DIR, "bad_words.yml")
BAD_WORDS = yaml.safe_load(open(bad_words_path, encoding="utf-8"))
PATTERNS = {}
for w, repl in BAD_WORDS.items():
    inner = "".join(f"{re.escape(c)}+\\W*" for c in w).rstrip(r"\\W*")
    PATTERNS[w] = re.compile(rf"(?<![A-Za-z]){inner}(?![A-Za-z])", re.I)

def sanitize(txt: str) -> str:
    for w, pat in PATTERNS.items():
        txt = pat.sub(BAD_WORDS[w], txt)
    return txt

# ————— نموذج الترجمة —————
ENABLE_ARABIC_TRANSLATION = str(os.getenv("EASYUI_ENABLE_AR_TRANSLATION", "1")).strip().lower() not in {
    "0", "false", "no", "off"
}
DEFAULT_UI_LANGUAGE = "ar" if ENABLE_ARABIC_TRANSLATION else "en"
TRANSLATION_DEVICE = 0 if torch.cuda.is_available() else -1
translator_ar_en = None
translator_en_ar = None

if ENABLE_ARABIC_TRANSLATION:
    try:
        _translator_ar_en_tok = AutoTokenizer.from_pretrained(
            "Helsinki-NLP/opus-mt-ar-en",
            use_fast=False
        )
        _translator_en_ar_tok = AutoTokenizer.from_pretrained(
            "Helsinki-NLP/opus-mt-en-ar",
            use_fast=False
        )
        translator_ar_en = pipeline(
            "translation",
            model="Helsinki-NLP/opus-mt-ar-en",
            tokenizer=_translator_ar_en_tok,
            device=TRANSLATION_DEVICE
        )
        translator_en_ar = pipeline(
            "translation",
            model="Helsinki-NLP/opus-mt-en-ar",
            tokenizer=_translator_en_ar_tok,
            device=TRANSLATION_DEVICE
        )
    except Exception as e:
        ENABLE_ARABIC_TRANSLATION = False
        translator_ar_en = None
        translator_en_ar = None
        logging.warning("Arabic translation models are not available. Translation disabled: %s", e)
else:
    logging.info("Arabic translation disabled by EASYUI_ENABLE_AR_TRANSLATION")

AR_RE = re.compile(r"[\u0600-\u06FF]")

def translate_ar_to_en(txt: str) -> str:
    if not ENABLE_ARABIC_TRANSLATION or translator_ar_en is None:
        return txt
    if not txt:
        return txt
    if not AR_RE.search(txt):
        return txt
    try:
        out = translator_ar_en(txt, max_length=512)
        return out[0]["translation_text"]
    except Exception as e:
        logging.warning("translate_ar_to_en failed: %s", e)
        return txt

def translate_en_to_ar(txt: str) -> str:
    if not ENABLE_ARABIC_TRANSLATION or translator_en_ar is None:
        return txt
    if not txt:
        return txt
    if AR_RE.search(txt):
        return txt

    def _split_for_translation(s: str, max_chars: int = 1200) -> List[str]:
        if len(s) <= max_chars:
            return [s]
        parts: List[str] = []
        start = 0
        n = len(s)
        while start < n:
            end = min(start + max_chars, n)
            if end < n:
                # Prefer splitting on whitespace/newline to avoid cutting tokens harshly.
                cut = max(s.rfind("\n", start, end), s.rfind(" ", start, end))
                if cut <= start:
                    cut = end
            else:
                cut = end
            parts.append(s[start:cut])
            start = cut
        return parts

    def _translate_chunk_safe(chunk: str) -> str:
        try:
            out = translator_en_ar(chunk, max_length=512, truncation=True)
            if out and isinstance(out, list) and isinstance(out[0], dict):
                return out[0].get("translation_text", chunk)
            return chunk
        except Exception as e:
            # Some replies can still exceed model/token limits; split recursively.
            if len(chunk) > 300:
                mid = len(chunk) // 2
                return _translate_chunk_safe(chunk[:mid]) + _translate_chunk_safe(chunk[mid:])
            logging.warning("translate_en_to_ar chunk failed: %s", e)
            return chunk

    try:
        chunks = _split_for_translation(txt, max_chars=1200)
        return "".join(_translate_chunk_safe(c) if c.strip() else c for c in chunks)
    except Exception as e:
        logging.warning("translate_en_to_ar failed: %s", e)
        return txt

def translate(txt: str) -> str:
    return translate_ar_to_en(txt)

# ————— نموذج تصنيف النية zero-shot —————
INTENT_MODEL = "microsoft/Multilingual-MiniLM-L12-H384"
DEVICE = 0 if torch.cuda.is_available() else -1
intent_pipeline = pipeline(
    "zero-shot-classification",
    model=INTENT_MODEL,
    tokenizer=AutoTokenizer.from_pretrained(INTENT_MODEL, use_fast=False),
    device=DEVICE
)
INTENT_THRESHOLD = 0.6

LAST_INTENT: Dict[str, str] = {}
LAST_FILE_PATH: Dict[str, List[str]] = {}  # قائمة بآخر الملفات المستخدمة لكل جلسة
GEN_THUMBS: Dict[str, str] = {}
# (جديد) للاحتفاظ بمعلومات ملف comfy الأصلي
ORIG_GEN_PATH: Dict[str, str] = {}
ORIG_GEN_PATH_MAP: Dict[str, str] = {}  # local_savep -> comfy original path
LAST_INFO: Dict[str, dict] = {}
MULTI_RESULTS: Dict[str, list] = {}  # sid -> list of extra result URLs (multi-output workflows)

def classify_intent(text: str, sid: str) -> str:
    try:
        res = intent_pipeline(text, INTENTS, multi_label=False)
        intent, score = res["labels"][0], res["scores"][0]
        logging.info("Intent classification: %r -> %s (%.2f)", text, intent, score)
        if score < INTENT_THRESHOLD:
            return LAST_INTENT.get(sid, "generate")
        return intent
    except Exception as e:
        logging.error("Intent classification failed: %s", e)
        return LAST_INTENT.get(sid, "generate")

def alias_lookup(cmd: str) -> Tuple[Optional[str], Optional[str]]:
    n = cmd.strip().lower()
    # المرحلة 1: بحث في بداية النص — الأطول يُفحص أولاً عبر كل النوايا
    for a, intent in FLAT_ALIASES:
        if re.match(rf"{re.escape(a)}(?:[\s,،;؛:：.!?؟\-_/\\|]|$)", n):
            return intent, a
    # المرحلة 2: بحث في أي مكان — الأقرب للبداية يفوز، وعند التساوي الأطول يفوز
    best: Tuple[int, int, str, str] | None = None     # (pos, -len, intent, word)
    for a, intent in FLAT_ALIASES:
        m = re.search(rf"\b{re.escape(a)}\b", n)
        if m:
            candidate = (m.start(), -len(a), intent, m.group(0))
            if best is None or candidate[:2] < best[:2]:
                best = candidate
    if best:
        return best[2], best[3]
    return None, None

def strip_alias_prefix(cmd: str, alias_word: Optional[str]) -> str:
    """يحذف alias من بداية الرسالة مع أي فواصل/مسافات تليه، مثل: alias, prompt"""
    if not cmd or not alias_word:
        return (cmd or "").strip()
    pattern = rf"^\s*{re.escape(alias_word)}(?:[\s,،;؛:：.!?؟\-_/\\|]+)?"
    return re.sub(pattern, "", cmd, count=1, flags=re.IGNORECASE).strip()

def find_workflow(intent: str, branch: str) -> Optional[str]:
    entry = INTENTS_LOOKUP.get(intent)
    if not entry:
        return None
    fname = entry["file"]
    # إذا كانت fname موجودة في file، استخدمها
    if not fname:
        return None
    # حاول أولاً الفرع المختار، ثم fallback إلى Main عند عدم وجود الملف
    selected_dir = WORKF_DIRS.get(branch) or ""
    main_dir = WORKF_DIRS.get("Main", "")

    candidates: List[str] = []
    if selected_dir:
        candidates.append(selected_dir)
    if main_dir and main_dir not in candidates:
        candidates.append(main_dir)

    for d in candidates:
        path = os.path.join(d, fname)
        if os.path.exists(path):
            return path
    return None

# ===== Helpers لمسارات Comfy الأصلية + فهرس الوسائط (جديد) =====
IMG_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".webm", ".mov", ".mp3", ".wav", ".ogg"}

def _is_abs_windows_path(p: str) -> bool:
    if not isinstance(p, str) or not p:
        return False
    p = p.strip()
    return (len(p) >= 3 and p[1] == ':' and (p[2] == '\\' or p[2] == '/')) or p.startswith('\\\\')

def _compose_from_hint(info: dict) -> Optional[str]:
    """يحاول تركيب المسار من comfy_path.txt حين لا يوجد path مطلق واضح."""
    filename = info.get("filename") or info.get("file") or ""
    if not filename:
        return None
    subfolder = (info.get("subfolder") or "").strip("\\/")
    typ = (info.get("type") or "").lower().strip()
    if typ == "temp":
        base = COMFY_HINT_TEMP or (os.path.join(COMFY_HINT_ROOT or "", "temp") if COMFY_HINT_ROOT else None)
    else:
        base = COMFY_HINT_OUTPUT or (os.path.join(COMFY_HINT_ROOT or "", "output") if COMFY_HINT_ROOT else None)
    if not base:
        return None
    return os.path.join(base, subfolder, filename) if subfolder else os.path.join(base, filename)

def _resolve_comfy_original_path(info: dict) -> Optional[str]:
    """يحاول إيجاد المسار الأصلي لملف ناتج ComfyUI."""
    try_keys = ("fullpath", "absolute_path", "output_path", "path")
    for k in try_keys:
        v = info.get(k)
        if v and (os.path.isabs(v) or _is_abs_windows_path(v)) and os.path.exists(v):
            return v
    out_dir = info.get("output_dir")
    filename = info.get("filename") or info.get("file") or ""
    subfolder = info.get("subfolder") or ""
    if out_dir and (os.path.isabs(out_dir) or _is_abs_windows_path(out_dir)) and filename:
        sd = subfolder.strip("\\/")
        return os.path.join(out_dir, sd, filename) if sd else os.path.join(out_dir, filename)
    # أخيرًا: حاول تركيب المسار بالاعتماد على comfy_path.txt
    return _compose_from_hint(info)

def _as_windows_path(p: str) -> str:
    return os.path.abspath(p).replace('/', '\\')

def get_user_dir(username: str) -> str:
    user_dir = os.path.join(USERS_DIR, username)
    os.makedirs(user_dir, exist_ok=True)
    return user_dir

def append_user_media_index(username: str, full_path: str, kind: str, orig_path: Optional[str] = None) -> None:
    """يسجل كل ملف (مرفوع/مولد) في users/<user>/media_paths.txt ليسهل حذفها لاحقًا."""
    try:
        if not username:
            username = "guest"
        if not full_path:
            return
        user_dir = get_user_dir(username)
        index_path = os.path.join(user_dir, "media_paths.txt")
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        line = f"[{ts}] {kind}: {_as_windows_path(full_path)}"
        if orig_path:
            line += f" | comfy_src: {_as_windows_path(orig_path)}"
        with open(index_path, "a", encoding="utf-8") as f:
            f.write(line + "\n")
        logging.info("media_paths.txt <= %s", line)
    except Exception as e:
        logging.error("Failed updating media_paths.txt: %s", e)

# ===== رفع الملفات =====
def save_uploaded_file(file_base64: str, sid: str, username: str = "guest") -> str:
    header, data64 = file_base64.split(",", 1)
    raw = base64.b64decode(data64)
    
    if 'image/' in header:
        ext = '.png'
        img = Image.open(io.BytesIO(raw))
        img = ImageOps.exif_transpose(img)
        # احفظ دائمًا كـ RGBA للحفاظ على قناة الشفافية إن وُجدت
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        fname = f"u_{uuid.uuid4().hex}{ext}"
        savep = os.path.join(COMFY_INPUT_DIR, fname)
        img.save(savep, format="PNG")
        img.close()
        try:
            Image.open(savep).verify()
        except:
            os.remove(savep)
            raise ValueError("Invalid image file")
    else:
        ext_map = {
            'video/mp4': '.mp4',
            'video/webm': '.webm',
            'video/quicktime': '.mov',
            'audio/mpeg': '.mp3',
            'audio/wav': '.wav',
            'audio/ogg': '.ogg',
            'audio/flac': '.flac',
            'audio/x-flac': '.flac',
            'audio/aac': '.aac',
            'audio/mp4': '.m4a',
            'audio/x-m4a': '.m4a',
            'audio/opus': '.opus',
            'audio/webm': '.weba'
        }
        ext = next((e for m, e in ext_map.items() if m in header), '.bin')
        fname = f"u_{uuid.uuid4().hex}{ext}"
        savep = os.path.join(COMFY_INPUT_DIR, fname)
        with open(savep, "wb") as f:
            f.write(raw)

        # تحويل أي صوت غير mp3/wav إلى mp3 تلقائيًا
        # ملاحظة: الحفاظ على الجودة "نفسها" غير ممكن دائمًا لأن MP3 صيغة ضياعية،
        # لذا نستخدم أعلى جودة عملية (-q:a 0) مع الحفاظ على sample rate/channels.
        if 'audio/' in header and ext not in ('.mp3', '.wav'):
            mp3_fname = f"u_{uuid.uuid4().hex}.mp3"
            mp3_savep = os.path.join(COMFY_INPUT_DIR, mp3_fname)
            try:
                cmd = [
                    "ffmpeg", "-y",
                    "-i", savep,
                    "-vn",
                    "-codec:a", "libmp3lame",
                    "-q:a", "0",
                    mp3_savep
                ]
                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
                if proc.returncode != 0 or (not os.path.exists(mp3_savep)) or os.path.getsize(mp3_savep) == 0:
                    err = (proc.stderr or proc.stdout or "unknown ffmpeg error").strip()
                    raise RuntimeError(err)

                # استخدم الملف المحوَّل فقط
                try:
                    os.remove(savep)
                except Exception:
                    pass
                fname = mp3_fname
                savep = mp3_savep
            except FileNotFoundError:
                raise RuntimeError("FFmpeg غير مثبت أو غير موجود في PATH. لا يمكن تحويل الصوت إلى mp3.")
            except Exception as e:
                try:
                    if os.path.exists(mp3_savep):
                        os.remove(mp3_savep)
                except Exception:
                    pass
                raise RuntimeError(f"فشل تحويل الصوت إلى mp3: {e}")

    # استخدم مفتاح مركب لمنع اختلاط الملفات بين المستخدمين
    key = f"{username}:{sid}" if username else sid
    if key not in LAST_FILE_PATH:
        LAST_FILE_PATH[key] = []
    LAST_FILE_PATH[key].insert(0, savep)  # أضف في البداية (الأحدث أولاً)
    LAST_FILE_PATH[key] = LAST_FILE_PATH[key][:10]  # احتفظ بآخر 10 ملفات فقط
    return fname

# ===== إرسال إلى ComfyUI =====
def comfy_send(graph: dict, sid: str, result_spec: dict = None, username: str = "guest",
               multi_result_specs: list = None) -> tuple:
    """Send a prompt to ComfyUI and return a saved /media URL for the selected output.
    If `result_spec` is provided (from workflow_requirements.yml), it must be a dict like:
      { "node": "3", "kind": "image"|"video"|"audio", "index": 0 }
    If `multi_result_specs` is a list of such dicts, ALL matching outputs are collected.
    The primary result is returned normally; extras go into MULTI_RESULTS[sid].
    """
    # مفتاح مركب لمنع اختلاط الملفات بين المستخدمين
    storage_key = f"{username}:{sid}" if username else sid
    MULTI_RESULTS.pop(sid, None)  # clear any previous extras
    host = os.getenv("COMFY_HOST", "http://127.0.0.1:8188")
    cid = str(uuid.uuid4())
    payload = {"prompt": graph, "client_id": cid}
    try:
        r = requests.post(f"{host}/prompt", json=payload, timeout=60)
    except Exception as e:
        logging.error("ComfyUI connection error: %s", e)
        return None, f"ComfyUI connection error: {e}"
    if r.status_code != 200:
        logging.error("ComfyUI %s error: %s", r.status_code, r.text)
        return None, f"ComfyUI error {r.status_code}: {r.text}"

    pid = r.json().get("prompt_id")
    tries = int(os.getenv("COMFY_WAIT_TRIES", "1800"))  # up to 30 minutes with 1s sleep

    video_keys = ["gifs", "videos", "video", "mp4s"]
    image_keys = ["images", "image", "pngs", "jpgs"]
    audio_keys = ["audios", "audio", "wavs", "mp3s", "flacs", "m4as", "opuses", "oggs"]
    text_keys = ["text", "texts", "string", "strings"]

    def _save_info_return_url(info, default_ext):
        # Handle text strings directly (not as files)
        if default_ext == ".txt" and isinstance(info, str):
            # If info is a plain string (text output), save it as text file
            fname = f"g_{uuid.uuid4().hex}.txt"
            savep = os.path.join(COMFY_OUTPUT_DIR, fname)
            try:
                with open(savep, "w", encoding="utf-8") as f:
                    f.write(info)
                # استخدم مفتاح مركب لمنع اختلاط الملفات بين المستخدمين
                if storage_key not in LAST_FILE_PATH:
                    LAST_FILE_PATH[storage_key] = []
                LAST_FILE_PATH[storage_key].insert(0, savep)
                LAST_FILE_PATH[storage_key] = LAST_FILE_PATH[storage_key][:10]
                return f"/media/{fname}"
            except Exception as e:
                logging.error("Failed to write text output: %s", e)
                return None
        
        ext = os.path.splitext(info.get("filename", "") or info.get("file", "") or "")[1].lower() or default_ext
        path = info.get("fullpath") or (os.path.join(COMFY_OUTPUT_DIR, info.get("filename","")) if info.get("filename") else None)
        data = None
        if path:
            try:
                with open(path, "rb") as f:
                    data = f.read()
            except Exception:
                data = None
        if data is None:
            try:
                data = requests.get(f"{host}/view", params=info, timeout=30).content
            except Exception as e:
                logging.error("ComfyUI view error: %s", e)
                data = b""
        fname = f"g_{uuid.uuid4().hex}{ext}"
        savep = os.path.join(COMFY_OUTPUT_DIR, fname)
        try:
            with open(savep, "wb") as f:
                f.write(data)
        except Exception as e:
            logging.error("Failed to write output file: %s", e)
        # استخدم مفتاح مركب لمنع اختلاط الملفات بين المستخدمين
        if storage_key not in LAST_FILE_PATH:
            LAST_FILE_PATH[storage_key] = []
        LAST_FILE_PATH[storage_key].insert(0, savep)
        LAST_FILE_PATH[storage_key] = LAST_FILE_PATH[storage_key][:10]

        # (جديد) حفظ معلومات الملف الأصلي + محاولة استنتاج المسار الحقيقي
        try:
            LAST_INFO[sid] = info
            orig = _resolve_comfy_original_path(info)
            ORIG_GEN_PATH[sid] = orig or ""
            ORIG_GEN_PATH_MAP[savep] = orig or ""  # خريطة محلي → ComfyUI أصلي
        except Exception:
            ORIG_GEN_PATH[sid] = ""
            ORIG_GEN_PATH_MAP[savep] = ""

        # try to produce a small thumbnail for quick preview
        # Only set if not already present — preserves the first image's
        # thumbnail when multiple SaveImage nodes produce output.
        if sid not in GEN_THUMBS:
            try:
                from PIL import Image
                import io, base64
                im = Image.open(io.BytesIO(data)).convert("RGB")
                im.thumbnail((480, 480))
                buf = io.BytesIO()
                im.save(buf, format="JPEG", quality=78)
                b64 = base64.b64encode(buf.getvalue()).decode("ascii")
                GEN_THUMBS[sid] = "data:image/jpeg;base64," + b64
            except Exception:
                pass
        return f"/media/{fname}"

    for _ in range(tries):
        try:
            d = requests.get(f"{host}/history/{pid}", timeout=10).json()
        except Exception:
            time.sleep(1)
            continue

        outs = d.get("outputs") or d.get(pid, {}).get("outputs", {}) or {}

        # 0) Multi-result: collect ALL specified nodes (skip missing ones)
        if multi_result_specs and isinstance(multi_result_specs, list) and len(multi_result_specs) > 1:
            collected_urls = []
            nodes_checked = 0
            for ms in multi_result_specs:
                try:
                    m_node_id = str(ms.get("node", "")).strip()
                    m_kind = ms.get("kind")
                    m_index = int(ms.get("index", 0))
                except Exception:
                    m_node_id, m_kind, m_index = "", None, 0
                if not m_node_id or m_node_id not in outs:
                    continue  # skip missing nodes, don't abort
                nodes_checked += 1
                blk = outs[m_node_id]
                if not m_kind:
                    m_ordered = list(video_keys) + list(image_keys) + list(audio_keys) + list(text_keys)
                else:
                    m_kind_map = {"image": image_keys, "video": video_keys, "audio": audio_keys, "text": text_keys}
                    m_ordered = m_kind_map.get(str(m_kind).lower(), image_keys)
                found_url = None
                for k in m_ordered:
                    arr = blk.get(k) or []
                    if arr:
                        idx = m_index if 0 <= m_index < len(arr) else 0
                        info = arr[idx]
                        if k in video_keys: dext = ".mp4"
                        elif k in image_keys: dext = ".png"
                        elif k in audio_keys: dext = ".wav"
                        elif k in text_keys: dext = ".txt"
                        else: dext = ".bin"
                        found_url = _save_info_return_url(info, dext)
                        break
                if found_url:
                    collected_urls.append(found_url)
            # Return when we have results (at least 1 node found output)
            if collected_urls:
                primary = collected_urls[0]
                if len(collected_urls) > 1:
                    MULTI_RESULTS[sid] = collected_urls[1:]
                return primary, None
            # If outs is non-empty but multi found nothing, fall through to single/fallback
            # If outs is empty (prompt not done yet), will sleep and retry below

        # 1) If result_spec provided, honor it first
        if result_spec:
            try:
                node_id = str(result_spec.get("node", "")).strip()
                kind = result_spec.get("kind")  # may be None
                index = int(result_spec.get("index", 0))
            except Exception:
                node_id, kind, index = "", None, 0
            if node_id and node_id in outs:
                blk = outs[node_id]
                # If 'kind' not provided, auto-detect from this block only (video -> image -> audio)
                if not kind:
                    ordered_keys = list(video_keys) + list(image_keys) + list(audio_keys) + list(text_keys)
                else:
                    kind_map = {
                        "image": image_keys,
                        "video": video_keys,
                        "audio": audio_keys,
                        "text": text_keys,
                    }
                    ordered_keys = kind_map.get(str(kind).lower(), image_keys)
                for k in ordered_keys:
                    arr = blk.get(k) or []
                    if arr:
                        # If index is out of range, clamp to last available
                        i = index if 0 <= index < len(arr) else 0
                        info = arr[i]
                        # Default extension inferred by key group
                        if k in video_keys:
                            default_ext = ".mp4"
                        elif k in image_keys:
                            default_ext = ".png"
                        elif k in audio_keys:
                            default_ext = ".wav"
                        elif k in text_keys:
                            default_ext = ".txt"
                        else:
                            default_ext = ".bin"
                        picked_url = _save_info_return_url(info, default_ext)
                        if picked_url:
                            return picked_url, None

        # 2) Fallback scan: collect ALL non-temp/non-input outputs from all nodes
        _fb_urls = []
        for _fb_nid, blk in outs.items():
            _picked = None
            for _kg, _dext in [(video_keys, ".mp4"), (image_keys, ".png"), (audio_keys, ".wav")]:
                if _picked:
                    break
                for _k in _kg:
                    arr = blk.get(_k) or []
                    if arr:
                        _info = arr[0]
                        if isinstance(_info, dict) and _info.get("type") in ("temp", "input"):
                            continue
                        _picked = _save_info_return_url(_info, _dext)
                        break
            if _picked:
                _fb_urls.append(_picked)
        if _fb_urls:
            if len(_fb_urls) > 1:
                MULTI_RESULTS[sid] = _fb_urls[1:]
            return _fb_urls[0], None

        time.sleep(1)

    return None, "⏳ ComfyUI timeout"


def patch_workflow(
    graph: dict,
    pos: str,
    neg: str,
    node_specs: Dict[str, Dict[str, Any]],
    file_fnames: List[str]
) -> dict:
    def _media_kind(path_or_name: str) -> Optional[str]:
        s = (path_or_name or "").lower()
        ext = os.path.splitext(s)[1]
        if ext in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff"}:
            return "image"
        if ext in {".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v"}:
            return "video"
        if ext in {".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a", ".opus", ".weba"}:
            return "audio"
        return None

    media_files: Dict[str, List[str]] = {"image": [], "video": [], "audio": []}
    for f in file_fnames or []:
        p = f if os.path.isabs(f) else os.path.join(COMFY_INPUT_DIR, f)
        kind = _media_kind(p)
        if kind:
            media_files[kind].append(p)

    for nid, node in graph.items():
        ct = node.get("class_type")
        if ct in ("KSampler", "SDParameterGenerator"):
            node["inputs"]["seed"] = random.randint(0, 2**31 - 1)
        if ct == "KSamplerAdvanced":
            node["inputs"]["noise_seed"] = random.randint(0, 2**31 - 1)

    comfy_seed_max = 4294967295

    for nid, spec in node_specs.items():
        node = graph.get(nid)
        if not node:
            continue
        for input_key, action in spec.get("inputs", {}).items():
            if action == "random_num":
                node["inputs"][input_key] = random.randint(0, comfy_seed_max)
            elif action == "positive" and pos.strip():
                base = node["inputs"].get(input_key, "").rstrip()
                node["inputs"][input_key] = base + pos
            elif action == "negative" and neg.strip():
                base = node["inputs"].get(input_key, "").rstrip()
                node["inputs"][input_key] = base + neg
            elif action.startswith(("image", "video", "audio")) and file_fnames:
                m = re.match(r"(image|video|audio)(\d*)$", action)
                if not m:
                    continue
                file_type = m.group(1)
                idx = 1 if m.group(2) == "" else int(m.group(2))
                i0 = idx - 1
                typed_files = media_files.get(file_type, [])
                if 0 <= i0 < len(typed_files):
                    path = typed_files[i0]
                    node["inputs"][input_key] = path
            elif action.startswith("result*"):
                result_type = action[7:].lower()  # extract type after "result*"
                node["inputs"][input_key] = f"__RESULT_MARKER__:{result_type}"
    return graph

# ————— دعم القوالب + المجلدات (icon.*) —————
IMG_EXTS_TPL = {".jpg", ".jpeg", ".png", ".gif", ".webp"}

def read_template_meta(stem_path: Path) -> Tuple[str, str]:
    label = ""
    command = ""
    txt_path = stem_path.with_suffix(".txt")
    if txt_path.exists():
        lines = txt_path.read_text(encoding="utf-8").splitlines()
        if len(lines) >= 1:
            label = lines[0].strip()
        if len(lines) >= 2:
            command = lines[1].strip()
    return label, command

def find_folder_icon(folder: Path) -> Optional[Path]:
    for p in folder.iterdir():
        if not p.is_file():
            continue
        stem = p.stem.lower()
        if stem == "icon" and p.suffix.lower() in IMG_EXTS_TPL:
            return p
    return None

def build_templates_tree(base_dir: str) -> List[Dict[str, Any]]:
    base_path = Path(base_dir)
    items: List[Dict[str, Any]] = []

    for p in sorted(base_path.iterdir()):
        if p.is_file() and p.suffix.lower() in IMG_EXTS_TPL:
            label, command = read_template_meta(p.with_suffix(""))
            items.append({
                "img": f"templates/{p.name}",
                "label": label,
                "command": command,
                "is_folder": False,
            })

    for folder in sorted(base_path.iterdir()):
        if not folder.is_dir():
            continue

        icon_path = find_folder_icon(folder)
        children = []
        for child in sorted(folder.iterdir()):
            if not child.is_file():
                continue
            if child.suffix.lower() not in IMG_EXTS_TPL:
                continue
            if icon_path is not None and child.samefile(icon_path):
                continue

            label, command = read_template_meta(child.with_suffix(""))
            children.append({
                "img": f"templates/{folder.name}/{child.name}",
                "label": label,
                "command": command,
                "is_folder": False,
            })

        folder_img_path = None
        if icon_path is not None:
            folder_img_path = f"templates/{folder.name}/{icon_path.name}"
        elif children:
            first_child_img_rel = children[0]["img"]
            folder_img_path = first_child_img_rel

        if not children:
            continue

        label = folder.name
        command = ""
        items.append({
            "img": folder_img_path,
            "label": label,
            "command": command,
            "is_folder": True,
            "children": children,
        })

    return items

# ————— إدارة المستخدمين —————
def save_user_data(username: str, data_type: str, data: dict):
    user_dir = get_user_dir(username)
    file_path = os.path.join(user_dir, f"{data_type}.json")
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def load_user_data(username: str, data_type: str) -> dict:
    user_dir = get_user_dir(username)
    file_path = os.path.join(user_dir, f"{data_type}.json")
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def _normalize_ui_lang(lang: Optional[str]) -> str:
    s = (lang or "").strip().lower()
    if s.startswith("ar"):
        return "ar"
    if s.startswith("en"):
        return "en"
    if s.startswith("zh"):
        return "zh"
    if s.startswith("ja"):
        return "ja"
    return DEFAULT_UI_LANGUAGE

def _resolve_ui_lang(username: Optional[str] = None, ui_language: Optional[str] = None, request: Optional[Request] = None) -> str:
    # 1) explicit payload/query value
    lang = _normalize_ui_lang(ui_language)
    if ui_language and lang in ("ar", "en", "zh", "ja"):
        return lang

    # 2) persisted user setting
    u = (username or "guest").strip() or "guest"
    if u != "guest":
        try:
            s = load_user_data(u, "settings") or {}
            lang2 = _normalize_ui_lang(s.get("ui_language"))
            if lang2 in ("ar", "en", "zh", "ja"):
                return lang2
        except Exception:
            pass

    # 3) accept-language header (useful for guest)
    try:
        if request is not None:
            acc = (request.headers.get("accept-language") or "").lower()
            if acc.startswith("zh") or ",zh" in acc or "zh-" in acc:
                return "zh"
            if acc.startswith("ja") or ",ja" in acc or "ja-" in acc:
                return "ja"
            if acc.startswith("en") or ",en" in acc or "en-" in acc:
                return "en"
    except Exception:
        pass

    return DEFAULT_UI_LANGUAGE

_MSG_I18N = {
    "common.unexpected_with_error": {
        "ar": "حدث خطأ غير متوقع: {error}",
        "en": "An unexpected error occurred: {error}",
        "zh": "发生意外错误: {error}",
        "ja": "予期しないエラーが発生しました: {error}",
    },
    "pythonapp.bat_not_found": {
        "ar": "ملف البات '{script_name}.bat' غير موجود في مجلد pythonapp",
        "en": "Batch file '{script_name}.bat' was not found in pythonapp folder",
        "zh": "在 pythonapp 文件夹中未找到批处理文件 '{script_name}.bat'",
        "ja": "pythonapp フォルダにバッチファイル '{script_name}.bat' が見つかりません",
    },
    "pythonapp.ok": {
        "ar": "✅ تم تنفيذ الأمر بنجاح",
        "en": "✅ Command executed successfully",
        "zh": "✅ 命令执行成功",
        "ja": "✅ コマンドを正常に実行しました",
    },
    "pythonapp.invalid_usage": {
        "ar": "صيغة خاطئة. الاستخدام: pythonapp <script_name> <command>",
        "en": "Invalid format. Usage: pythonapp <script_name> <command>",
        "zh": "格式无效。用法: pythonapp <script_name> <command>",
        "ja": "形式が不正です。使用法: pythonapp <script_name> <command>",
    },
    "pythonapp.timeout": {
        "ar": "انتهت مهلة التنفيذ (5 دقائق)",
        "en": "Execution timed out (5 minutes)",
        "zh": "执行超时（5 分钟）",
        "ja": "実行がタイムアウトしました（5分）",
    },
    "pythonapp.exec_error": {
        "ar": "خطأ في التنفيذ: {error}",
        "en": "Execution error: {error}",
        "zh": "执行错误: {error}",
        "ja": "実行エラー: {error}",
    },
    "workflow.not_found": {
        "ar": "لا يوجد workflow للنية '{intent}' في الفرع '{branch}'",
        "en": "No workflow found for intent '{intent}' in branch '{branch}'",
        "zh": "在分支 '{branch}' 中未找到意图 '{intent}' 的 workflow",
        "ja": "ブランチ '{branch}' に意図 '{intent}' の workflow が見つかりません",
    },
    "workflow.load_failed": {
        "ar": "فشل تحميل ملف workflow.",
        "en": "Failed to load workflow file.",
        "zh": "加载 workflow 文件失败。",
        "ja": "workflow ファイルの読み込みに失敗しました。",
    },
    "chat.no_files": {
        "ar": "لا توجد ملفات متوفرة للاستخدام",
        "en": "No files are available to use",
        "zh": "没有可用文件",
        "ja": "使用可能なファイルがありません",
    },
    "chat.file_hint": {
        "ar": "ما الذي تريد عمله بهذا الملف؟",
        "en": "What would you like to do with this file?",
        "zh": "你希望对这个文件做什么？",
        "ja": "このファイルで何をしたいですか？",
    },
    "workflow.patch_failed": {
        "ar": "فشل تجهيز الرسم البياني للـ workflow.",
        "en": "Failed to prepare workflow graph.",
        "zh": "准备 workflow 图失败。",
        "ja": "workflow グラフの準備に失敗しました。",
    },
    "user.guest_history_forbidden": {
        "ar": "لا يمكن استرجاع سجل الضيف",
        "en": "Guest history cannot be retrieved",
        "zh": "无法获取访客历史记录",
        "ja": "ゲスト履歴は取得できません",
    },
    "user.guest_delete_forbidden": {
        "ar": "لا يمكن حذف سجل الضيف",
        "en": "Guest history cannot be deleted",
        "zh": "无法删除访客历史记录",
        "ja": "ゲスト履歴は削除できません",
    },
    "user.guest_settings_forbidden": {
        "ar": "لا يمكن حفظ إعدادات الضيف",
        "en": "Guest settings cannot be saved",
        "zh": "无法保存访客设置",
        "ja": "ゲスト設定は保存できません",
    },
    "user.guest_cleanup_forbidden": {
        "ar": "لا يمكن تنظيف ملفات الضيف",
        "en": "Guest files cannot be cleaned",
        "zh": "无法清理访客文件",
        "ja": "ゲストファイルはクリーンアップできません",
    },
    "plugins.not_found": {
        "ar": "الإضافة غير موجودة",
        "en": "Plugin not found",
        "zh": "未找到插件",
        "ja": "プラグインが見つかりません",
    },
    "myprompt.missing_data": {
        "ar": "البيانات ناقصة",
        "en": "Missing required data",
        "zh": "缺少必要数据",
        "ja": "必須データが不足しています",
    },
    "myprompt.save_image_failed": {
        "ar": "فشل حفظ الصورة: {error}",
        "en": "Failed to save image: {error}",
        "zh": "保存图片失败: {error}",
        "ja": "画像の保存に失敗しました: {error}",
    },
    "myprompt.save_text_failed": {
        "ar": "فشل حفظ النص: {error}",
        "en": "Failed to save text: {error}",
        "zh": "保存文本失败: {error}",
        "ja": "テキストの保存に失敗しました: {error}",
    },
    "myprompt.image_not_found": {
        "ar": "الصورة غير موجودة",
        "en": "Image not found",
        "zh": "未找到图片",
        "ja": "画像が見つかりません",
    },
    "myprompt.id_missing": {
        "ar": "معرف My Prompt مفقود",
        "en": "My Prompt ID is missing",
        "zh": "缺少 My Prompt ID",
        "ja": "My Prompt ID がありません",
    },
    "myprompt.delete_failed": {
        "ar": "فشل الحذف: {error}",
        "en": "Delete failed: {error}",
        "zh": "删除失败: {error}",
        "ja": "削除に失敗しました: {error}",
    },
}

def _tr(lang: str, key: str, **kwargs) -> str:
    d = _MSG_I18N.get(key, {})
    template = d.get(lang) or d.get("en") or d.get("ar") or key
    try:
        return template.format(**kwargs)
    except Exception:
        return template

def save_chat_history(username: str, session_id: str, messages: list):
    user_dir = get_user_dir(username)
    history_dir = os.path.join(user_dir, "history")
    os.makedirs(history_dir, exist_ok=True)
    file_path = os.path.join(history_dir, f"{session_id}.json")
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump({
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "messages": messages
        }, f, ensure_ascii=False, indent=2)

def load_chat_history(username: str, session_id: str) -> dict:
    user_dir = get_user_dir(username)
    history_dir = os.path.join(user_dir, "history")
    file_path = os.path.join(history_dir, f"{session_id}.json")
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def list_user_sessions(username: str) -> list:
    user_dir = get_user_dir(username)
    history_dir = os.path.join(user_dir, "history")
    if not os.path.exists(history_dir):
        return []
    
    sessions = []
    for fname in os.listdir(history_dir):
        if fname.endswith(".json"):
            session_id = fname[:-5]
            file_path = os.path.join(history_dir, fname)
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                last_message = data.get("messages", [{}])[-1]
                sessions.append({
                    "session_id": session_id,
                    "created_at": data.get("created_at"),
                    "updated_at": data.get("updated_at"),
                    "preview": last_message.get("content", "")[:50] if last_message else "",
                                    })
    
    return sorted(sessions, key=lambda x: x.get("updated_at", ""), reverse=True)

def delete_user_session(username: str, session_id: str):
    user_dir = get_user_dir(username)
    history_dir = os.path.join(user_dir, "history")
    file_path = os.path.join(history_dir, f"{session_id}.json")
    if os.path.exists(file_path):
        os.remove(file_path)
        return True
    return False

def cleanup_user_files(username: str, older_than_minutes: int = None):
    user_dir = get_user_dir(username)
    files_dir = os.path.join(user_dir, "files")
    if not os.path.exists(files_dir):
        return
    
    now = time.time()
    for fname in os.listdir(files_dir):
        file_path = os.path.join(files_dir, fname)
        if os.path.isfile(file_path):
            if older_than_minutes is None or (now - os.path.getmtime(file_path)) > older_than_minutes * 60:
                os.remove(file_path)

# ————— FastAPI —————
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)
app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")
app.mount("/templates", StaticFiles(directory=TEMPLATES_DIR))
app.mount("/media", StaticFiles(directory=COMFY_OUTPUT_DIR))
app.mount("/uploads", StaticFiles(directory=COMFY_INPUT_DIR), name="templates")
app.mount("/plugins", StaticFiles(directory=PLUGINS_DIR), name="plugins")

app.mount("/easy-tag", StaticFiles(directory=EASY_TAG_DIR), name="easy_tag")

class Req(BaseModel):
    message: Optional[str] = ""
    workflow_choice: str = "Main"
    neg_prompt: Optional[str] = None
    image_base64: Optional[str] = None
    image_base64_list: Optional[List[str]] = None
    username: Optional[str] = "guest"
    session_id: Optional[str] = None
    ui_language: Optional[str] = None
    auto_translate_arabic: Optional[bool] = None
    is_regeneration: Optional[bool] = False
    effective_pos: Optional[str] = None
    effective_neg: Optional[str] = None

class UserSettings(BaseModel):
    username: str
    favorite_templates: List[str] = []
    ui_language: Optional[str] = DEFAULT_UI_LANGUAGE
    auto_cleanup: Optional[bool] = False
    cleanup_after_minutes: Optional[int] = 5
    # Easy-Tag settings
    enable_tag_autocomplete: Optional[bool] = False
    tag_include_extra_quality: Optional[bool] = False
    tag_source_main: Optional[str] = None
    chant_source_main: Optional[str] = None
    auto_translate_arabic: Optional[bool] = True
    # LM (OLLAMA) settings
    lm_enabled: Optional[bool] = False
    lm_button_hidden: Optional[bool] = False
    lm_translate_arabic: Optional[bool] = False
    ollama_model: Optional[str] = "tinyllama:latest"
    dark_mode: Optional[bool] = False

# (جديد) Body لنقطة حذف الوسائط
class DeleteAllMediaReq(BaseModel):
    username: Optional[str] = "guest"
    ui_language: Optional[str] = None

def _normalize_easy_tag_source(path: Optional[str], kind: str) -> Optional[str]:
    """
    توحيد مسارات Easy-Tag إلى صيغة URL نسبية موحّدة:
    - tags  -> easy-tag/tags/<file>.json
    - chants-> easy-tag/chants/<file>.json
    هذا يضمن دائمًا القراءة من web/easy-tag عبر mount /easy-tag.
    """
    if not path:
        return None

    v = str(path).strip().replace("\\", "/")
    if not v:
        return None

    prefix = "easy-tag/tags/" if kind == "tags" else "easy-tag/chants/"
    idx = v.lower().find(prefix)
    if idx >= 0:
        v = prefix + v[idx + len(prefix):].lstrip("/")
    else:
        name = os.path.basename(v).strip()
        if not name:
            return None
        v = prefix + name

    if not v.lower().endswith(".json"):
        v += ".json"
    return v

def get_mime_type(filepath: str) -> str:
    ext = os.path.splitext(filepath)[1].lower()
    if ext in ('.png', '.jpg', '.jpeg', '.gif'):
        return f"image/{ext[1:]}"
    elif ext in ('.mp4', '.webm', '.mov'):
        return f"video/{ext[1:]}"
    elif ext in ('.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.opus', '.weba'):
        return f"audio/{ext[1:]}"
    return "application/octet-stream"

def _file_to_data_url(path: str) -> Optional[str]:
    """يحوّل ملفًا على القرص إلى data:URL base64."""
    try:
        if not path or not os.path.isfile(path):
            return None
        mime = get_mime_type(path)
        with open(path, "rb") as f:
            b = f.read()
        return "data:%s;base64,%s" % (mime, base64.b64encode(b).decode("ascii"))
    except Exception as e:
        logging.warning("تعذر تحويل الملف إلى data URL: %s", e)
        return None

def _build_used_payload(
    username: str,
    sid: str,
    rq: Req,
    used_file_paths: List[str],
    needs_file: bool,
    effective_pos: Optional[str] = None,
    effective_neg: Optional[str] = None,
) -> Dict[str, Any]:
    """
    نبني used_payload الذي سيُحفظ مع رسالة المساعد ويُعاد في رد /chat.
    دائمًا نحفظ "مسارات" داخل image_base64_list إذا كانت لدينا ملفات مستخدمة،
    حتى لو أرسل العميل Base64. هذا يقلل حجم ملف الجلسة بشكل كبير.
    """
    payload: Dict[str, Any] = {
        "message": (rq.message or ""),
        "neg_prompt": (rq.neg_prompt or None),
        "workflow_choice": (rq.workflow_choice or "Main"),
        "username": (username or "guest"),
        "session_id": sid,
    }
    if effective_pos is not None:
        payload["effective_pos"] = effective_pos
    if effective_neg is not None:
        payload["effective_neg"] = effective_neg

    # لو عندنا ملفات استُخدمت بالفعل، خزّن المسارات فقط (تجاهل أي Base64 وارد)
    img_paths: List[str] = []
    if used_file_paths:
        for p in used_file_paths:
            try:
                fname = os.path.basename(p)
                img_paths.append(f"/uploads/{fname}")
            except Exception:
                continue

    # إن لم يكن لدينا ملفات (حالة نادرة)، أبقِ الحقل فارغًا ولا تضع Base64
    # حتى لا ننفخ ملف الجلسة. سكربت الفرونت وقت الـregen يمكنه دائماً
    # إعادة رفع وسائط المستخدم إن لزم.
    if img_paths:
        payload["image_base64_list"] = img_paths

    return payload


# ✨ حفظ رسائل LM (OLLAMA) في الجلسة
class LMMessageReq(BaseModel):
    username: str = "guest"
    session_id: str = ""
    user_message: str = ""
    assistant_message: str = ""


# ✨ OLLAMA Proxy Endpoints
@app.get("/api/ollama/models")
async def get_ollama_models():
    """جلب قائمة النماذج المتاحة من OLLAMA"""
    try:
        ollama_base = os.getenv("OLLAMA_BASE", "http://localhost:11434")
        logging.info(f"جلب النماذج من OLLAMA: {ollama_base}")
        import requests
        response = requests.get(f"{ollama_base}/api/tags", timeout=10)
        logging.info(f"رد OLLAMA: status={response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            logging.info(f"النماذج المرجعة: {len(data.get('models', []))} نموذج")
            return data
        else:
            logging.warning(f"OLLAMA returned status {response.status_code}")
            return {"models": [], "error": f"OLLAMA returned status {response.status_code}"}
    except Exception as e:
        logging.error(f"فشل الاتصال بـ OLLAMA: {e}")
        return {"models": [], "error": str(e)}

class OllamaChatReq(BaseModel):
    username: str = "guest"
    session_id: str = ""
    user_message: str = ""
    model: str = "tinyllama:latest"
    chat_history: List[dict] = []
    translate_arabic: Optional[bool] = False

@app.post("/api/ollama/chat")
async def ollama_chat_proxy(rq: OllamaChatReq, request: Request):
    """إرسال رسالة إلى OLLAMA عبر الباكند"""
    sid = rq.session_id or request.headers.get("X-Session-ID", request.client.host)
    username = rq.username or "guest"
    translate_ar = bool(getattr(rq, "translate_arabic", False))
    
    try:
        ollama_base = os.getenv("OLLAMA_BASE", "http://localhost:11434")
        
        # إعداد payload لـ OLLAMA
        base_history = rq.chat_history or []
        messages = []

        if translate_ar:
            # ترجم التاريخ إلى الإنجليزية فقط عند وجود نص عربي للحفاظ على السياق
            for msg in base_history:
                if not isinstance(msg, dict):
                    continue
                msg_copy = dict(msg)
                content = msg_copy.get("content", "")
                if isinstance(content, str) and AR_RE.search(content):
                    msg_copy["content"] = translate_ar_to_en(content)
                messages.append(msg_copy)
        else:
            messages = list(base_history)

        user_message_original = rq.user_message or ""
        user_message_for_model = user_message_original
        user_msg_translated = False
        if translate_ar and AR_RE.search(user_message_original):
            translated = translate_ar_to_en(user_message_original)
            user_msg_translated = translated != user_message_original
            user_message_for_model = translated

        messages.append({"role": "user", "content": user_message_for_model})
        
        payload = {
            "model": rq.model,
            "messages": messages[-20:],  # آخر 20 رسالة
            "stream": False
        }
        
        # إرسال إلى OLLAMA
        import requests
        response = requests.post(
            f"{ollama_base}/api/chat",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=60
        )
        
        if response.status_code != 200:
            return {
                "error": f"OLLAMA Error {response.status_code}",
                "status": "error",
                "message": ""
            }
        
        data = response.json()
        reply = ""
        if data and data.get("message") and data["message"].get("content"):
            reply = data["message"]["content"]
        elif data.get("response"):
            reply = data["response"]
        else:
            reply = "لم أتلقَّ رداً صالحاً من OLLAMA"

        reply_original = reply
        reply_translated = False
        if translate_ar and reply and not AR_RE.search(reply):
            translated_reply = translate_en_to_ar(reply)
            reply_translated = translated_reply != reply_original
            reply = translated_reply
        
        # حفظ في سجل الجلسة
        if username != "guest":
            try:
                session_data = load_chat_history(username, sid)
                msgs = session_data.get("messages", [])
                
                user_record = {
                    "timestamp": datetime.now().isoformat(),
                    "role": "user",
                    "content": rq.user_message,
                    "files": [],
                    "lm_mode": True,
                    "model": rq.model
                }
                if translate_ar and user_msg_translated:
                    user_record["translated_content"] = user_message_for_model
                    user_record["translate_direction"] = "ar->en"
                msgs.append(user_record)
                
                assistant_record = {
                    "timestamp": datetime.now().isoformat(),
                    "role": "assistant",
                    "content": reply,
                    "files": [],
                    "lm_mode": True,
                    "model": rq.model
                }
                if translate_ar and reply_translated:
                    assistant_record["original_content"] = reply_original
                    assistant_record["translate_direction"] = "en->ar"
                msgs.append(assistant_record)
                
                save_chat_history(username, sid, msgs)
            except Exception as e:
                logging.error("فشل حفظ رسالة LM في الجلسة: %s", e)
        
        return {
            "status": "ok",
            "message": reply,
            "model": rq.model,
            "translated": translate_ar,
            "reply_translated": reply_translated,
            "original_reply": reply_original if reply_translated else None,
            "user_message_used": user_message_for_model if user_msg_translated else None
        }
        
    except Exception as e:
        logging.error("فشل إرسال رسالة إلى OLLAMA: %s", e)
        return {
            "error": str(e),
            "status": "error",
            "message": ""
        }


# (جديد) إصلاح حفظ الردود البسيطة + تضمين used_payload في السجل والرد
@app.get("/api/templates")
async def get_templates():
    try:
        out = build_templates_tree(TEMPLATES_DIR)
    except Exception as e:
        logging.error("فشل بناء شجرة القوالب: %s", e)
        out = []
    return out

@app.post("/chat")
async def chat(rq: Req, request: Request):
    sid = rq.session_id or request.headers.get("X-Session-ID", request.client.host)
    username = rq.username or "guest"
    ui_lang = _resolve_ui_lang(username=username, ui_language=rq.ui_language, request=request)

    text_raw = (rq.message or "").strip()
    file_list = rq.image_base64_list or ([rq.image_base64] if rq.image_base64 else [])

    alias_intent, alias_word = alias_lookup(text_raw)
    if alias_intent:
        intent = alias_intent
        # no_remove: إذا كانت النية مُعلَّمة بـ no_remove=true، لا يُشطب الـalias من النص
        _no_remove = bool(INTENTS_LOOKUP.get(alias_intent, {}).get("no_remove", False))
        if _no_remove:
            prompt_text = text_raw
        else:
            prompt_text = strip_alias_prefix(text_raw, alias_word)
    else:
        intent = classify_intent(text_raw, sid)
        prompt_text = text_raw
        
    prompt_text = replace_wildcards_in_text(prompt_text)
    neg_pre = replace_wildcards_in_text(rq.neg_prompt) if rq.neg_prompt else ""

    LAST_INTENT[sid] = intent
    intent_cfg = INTENTS_LOOKUP.get(intent, {})

    # ✨ محاولة الحصول على response من ملف أو نص مباشر
    res_text = None
    if intent_cfg.get("response_file"):
        try:
            response_file = intent_cfg["response_file"]
            # البحث في مجلد responses أو المسار المطلق
            if not os.path.isabs(response_file):
                response_file = os.path.join(BASE_DIR, "responses", response_file)
            if os.path.isfile(response_file):
                with open(response_file, "r", encoding="utf-8") as f:
                    res_text = f.read().strip()
                logging.info("تم قراءة الرد من: %s", response_file)
            else:
                logging.warning("ملف response_file غير موجود: %s", response_file)
        except Exception as e:
            logging.warning("فشل قراءة response_file: %s", e)
    
    # إذا فشلت قراءة الملف أو لم يوجد، استخدم response المباشر
    if not res_text and intent_cfg.get("response"):
        res_text = intent_cfg["response"]

    # رد ثابت من config
    if res_text:
        _di_method = "alias" if alias_intent else "zero-shot"
        _di_kw    = f"  (matched keyword: '{alias_word}')" if alias_intent else ""
        logging.info(
            "\n%s DETECTED INTENT (%s) %s\n"
            "  Input   : '%s'\n"
            "  Intent  : %s%s\n"
            "  Prompt  : '%s'\n"
            "  Workflow: N/A\n"
            "  Response: yes\n"
            "%s",
            "═" * 11, _di_method, "═" * 11,
            text_raw, intent, _di_kw, prompt_text,
            "═" * 51
        )
        # حفظ السجل (إن وُجد مستخدم) + تضمين used_payload للأكتمال (حتى لو بدون وسائط)
        if username != "guest":
            try:
                session_data = load_chat_history(username, sid)
                messages = session_data.get("messages", [])
                # سجل المستخدم
                messages.append({
                    "timestamp": datetime.now().isoformat(),
                    "role": "user",
                    "content": text_raw,
                    "files": []
                })
                # سجل المساعد مع used_payload المبني من الطلب (بدون وسائط)
                used_payload = _build_used_payload(username, sid, rq, [], False)
                messages.append({
                    "timestamp": datetime.now().isoformat(),
                    "role": "assistant",
                    "content": res_text,
                    "used_payload": used_payload,
                    "files": []
                })
                save_chat_history(username, sid, messages)
            except Exception as e:
                logging.error("فشل حفظ سجل الجلسة (رد ثابت): %s", e)
        return {
            "result": res_text,
            "error": None,
            "used_files": [],
            "used_files_data": [],
            "used_payload": _build_used_payload(username, sid, rq, [], False)
        }

    # ✨ معالجة pythonapp: تشغيل ملفات bat مع متغيرات
    if intent == "pythonapp" or text_raw.lower().startswith("pythonapp"):
        try:
            # استخراج: pythonapp <script_name> <args...>
            parts = text_raw.split(maxsplit=1)
            if len(parts) >= 2:
                rest = parts[1]  # "gallery https://..."
                args_parts = rest.split(maxsplit=1)
                
                if len(args_parts) >= 1:
                    script_name = args_parts[0]  # "gallery"
                    command_args = args_parts[1] if len(args_parts) > 1 else ""  # "https://..."
                    
                    # فضّل تشغيل ملف Python مباشرة لتجنّب مشاكل cmd.exe مع النصوص والرموز الخاصة
                    py_file = os.path.join(BASE_DIR, "pythonapp", f"{script_name}.py")
                    bat_file = os.path.join(BASE_DIR, "pythonapp", f"{script_name}.bat")

                    use_python_direct = os.path.isfile(py_file)
                    if use_python_direct:
                        cmd_list = [sys.executable or "python", py_file]
                    elif os.path.isfile(bat_file):
                        cmd_list = [bat_file]
                    else:
                        return {
                            "error": _tr(ui_lang, "pythonapp.bat_not_found", script_name=script_name),
                            "result": None,
                            "used_files": [],
                            "used_files_data": [],
                            "used_payload": _build_used_payload(username, sid, rq, [], False)
                        }
                    
                    # تشغيل السكربت مع تمرير النص الخام بأمان
                    import subprocess
                    import shlex
                    
                    env = os.environ.copy()
                    if command_args:
                        raw_args = command_args.strip()
                        # تمرير النص الخام كاملاً للحفاظ على المحتوى كما أرسله المستخدم
                        env["PYTHONAPP_INPUT"] = raw_args
                        # عند التشغيل المباشر لملف Python يمكن تمرير الوسائط بأمان دون تفسير cmd.exe
                        if use_python_direct:
                            try:
                                cmd_list.extend(shlex.split(raw_args, posix=False))
                            except ValueError:
                                cmd_list.append(raw_args)
                        # fallback لملفات bat فقط إذا كان النص آمنًا وقصيرًا
                        elif len(raw_args) < 7000 and not re.search(r'[&|<>^]', raw_args):
                            try:
                                cmd_list.extend(shlex.split(raw_args, posix=False))
                            except ValueError:
                                cmd_list.append(raw_args)
                    
                    result = subprocess.run(
                        cmd_list,
                        capture_output=True,
                        text=True,
                        encoding="utf-8",
                        timeout=300,
                        errors='replace',
                        env=env
                    )
                    
                    output = (result.stdout or "").strip()
                    error_output = (result.stderr or "").strip()
                    
                    # إذا كان هناك مخرجات، استخدمها، وإلا رسالة نجاح
                    final_output = output if output else _tr(ui_lang, "pythonapp.ok")
                    
                    return {
                        "result": final_output,
                        "error": error_output if result.returncode != 0 else None,
                        "used_files": [],
                        "used_files_data": [],
                        "used_payload": _build_used_payload(username, sid, rq, [], False)
                    }
            else:
                return {
                    "error": _tr(ui_lang, "pythonapp.invalid_usage"),
                    "result": None,
                    "used_files": [],
                    "used_files_data": [],
                    "used_payload": _build_used_payload(username, sid, rq, [], False)
                }
        except subprocess.TimeoutExpired:
            return {
                "error": _tr(ui_lang, "pythonapp.timeout"),
                "result": None,
                "used_files": [],
                "used_files_data": [],
                "used_payload": _build_used_payload(username, sid, rq, [], False)
            }
        except Exception as e:
            logging.error("فشل تنفيذ pythonapp: %s", e)
            return {
                "error": _tr(ui_lang, "pythonapp.exec_error", error=str(e)),
                "result": None,
                "used_files": [],
                "used_files_data": [],
                "used_payload": _build_used_payload(username, sid, rq, [], False)
            }

    branch = rq.workflow_choice or "Main"
    workflow = find_workflow(intent, branch)
    if not workflow:
        return {
            "error": _tr(ui_lang, "workflow.not_found", intent=intent, branch=branch),
            "result": None,
            "used_files": [],
            "used_files_data": [],
            "used_payload": _build_used_payload(username, sid, rq, [], False)
        }

    _di_method = "alias" if alias_intent else "zero-shot"
    _di_kw    = f"  (matched keyword: '{alias_word}')" if alias_intent else ""
    logging.info(
        "\n%s DETECTED INTENT (%s) %s\n"
        "  Input   : '%s'\n"
        "  Intent  : %s%s\n"
        "  Prompt  : '%s'\n"
        "  Workflow: %s  (branch: %s)\n"
        "  Response: no\n"
        "%s",
        "═" * 11, _di_method, "═" * 11,
        text_raw, intent, _di_kw, prompt_text,
        os.path.basename(workflow), branch,
        "═" * 51
    )

    try:
        with open(workflow, encoding="utf-8") as f:
            graph = json.load(f)
    except Exception as e:
        logging.error("فشل تحميل workflow %s: %s", workflow, e)
        return {
            "error": _tr(ui_lang, "workflow.load_failed"),
            "result": None,
            "used_files": [],
            "used_files_data": [],
            "used_payload": _build_used_payload(username, sid, rq, [], False)
        }

    wf_name = os.path.splitext(os.path.basename(workflow))[0]

    # اختيار مفتاح المتطلبات بمرونة:
    # 1) اسم النية (intent key)
    # 2) اسم ملف الوركفلو بدون امتداد
    # هذا يضمن العمل حتى لو اختلف اسم النية عن اسم ملف الوركفلو.
    req_key_candidates: List[str] = []
    for k in (intent, wf_name):
        if k and k not in req_key_candidates:
            req_key_candidates.append(k)

    req_key = next((k for k in req_key_candidates if k in WORKFLOW_REQUIREMENTS), wf_name)
    node_specs = WORKFLOW_REQUIREMENTS.get(req_key, {}).get("nodes", {})
    result_spec = WORKFLOW_REQUIREMENTS.get(req_key, {}).get("result", {})

    # Backward-compatible: allow declaring result node inside nodes.<id>
    # Collect ALL nodes with save/result flags for multi-output support
    all_result_specs = []
    if not result_spec:
        for _nid, _spec in (node_specs or {}).items():
            if not isinstance(_spec, dict):
                continue
            res_kind = _spec.get("result")
            save_flag = _spec.get("save") or _spec.get("is_result")
            res_index = _spec.get("index")
            
            # ✨ جديد: البحث عن result* في inputs
            result_marker = None
            inputs_spec = _spec.get("inputs", {})
            if isinstance(inputs_spec, dict):
                for inp_key, inp_val in inputs_spec.items():
                    if isinstance(inp_val, str) and inp_val.startswith("result*"):
                        result_marker = inp_val[7:].lower()  # extract type after "result*"
                        break
            
            if res_kind or save_flag or result_marker:
                nid = str(_nid)
                kind = "image"
                index = 0
                
                # تحديد النوع من result* إن وجد
                if result_marker:
                    kind = result_marker
                elif isinstance(res_kind, str):
                    m = re.match(r"^(image|video|audio|text)(\d+)?$", res_kind.strip().lower())
                    if m:
                        kind = m.group(1)
                        if m.group(2):
                            index = max(0, int(m.group(2)) - 1)
                
                if isinstance(res_index, int):
                    index = max(0, res_index)
                spec = {"node": nid}
                if res_kind:
                    spec["kind"] = kind
                if isinstance(res_index, int):
                    spec["index"] = max(0, res_index)
                all_result_specs.append(spec)

        # ✨ Auto-detect SaveImage-like nodes from the workflow graph
        _explicit_nids = {s.get("node") for s in all_result_specs}
        for _gnid, _gnode in graph.items():
            _gct = (_gnode.get("class_type") or "") if isinstance(_gnode, dict) else ""
            if _gct == "SaveImage" or (_gct.startswith("Save") and "Preview" not in _gct):
                if str(_gnid) not in _explicit_nids:
                    all_result_specs.append({"node": str(_gnid)})

        # primary result_spec = first match (backward compat)
        if all_result_specs:
            result_spec = all_result_specs[0]

    needs_file = any(
        action.startswith(("image", "video", "audio"))
        for spec in node_specs.values()
        for action in spec.get("inputs", {}).values()
    )

    # حساب عدد الملفات المطلوبة لكل نوع بشكل مستقل
    required_files_by_kind: Dict[str, int] = {"image": 0, "video": 0, "audio": 0}
    for spec in node_specs.values():
        for action in spec.get("inputs", {}).values():
            if isinstance(action, str) and action.startswith(("image", "video", "audio")):
                m = re.match(r"(image|video|audio)(\d*)$", action)
                if m:
                    idx = 1 if m.group(2) == "" else int(m.group(2))
                    kind = m.group(1)
                    required_files_by_kind[kind] = max(required_files_by_kind[kind], idx)

    def _media_kind(path_or_name: str) -> Optional[str]:
        s = (path_or_name or "").lower()
        ext = os.path.splitext(s)[1]
        if ext in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff"}:
            return "image"
        if ext in {".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v"}:
            return "video"
        if ext in {".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a", ".opus", ".weba"}:
            return "audio"
        return None

    file_fnames: list[str] = []
    if file_list:
        for file_b64 in file_list:
            try:
                fname = save_uploaded_file(file_b64, sid, username)
                file_fnames.append(fname)
                # (جديد) سجّل المرفوع في فهرس الوسائط
                fullp = os.path.join(COMFY_INPUT_DIR, fname)
                append_user_media_index(username, fullp, "uploaded", fullp)
            except Exception as e:
                logging.error("فشل حفظ ملف مرفق: %s", e)

    # إذا الملفات الحالية لا تغطي المطلوب لكل نوع، أكمل من الملفات السابقة (بنفس النوع فقط)
    if needs_file:
        have_by_kind: Dict[str, int] = {"image": 0, "video": 0, "audio": 0}
        for f in file_fnames:
            k = _media_kind(f)
            if k:
                have_by_kind[k] += 1

        key = f"{username}:{sid}" if username else sid
        prev_files = LAST_FILE_PATH.get(key, [])
        for prev in prev_files:
            if prev and os.path.exists(prev) and prev not in file_fnames:
                k = _media_kind(prev)
                if not k:
                    continue
                if have_by_kind[k] >= required_files_by_kind.get(k, 0):
                    continue
                file_fnames.append(prev)
                have_by_kind[k] += 1

        missing_required = [
            k for k, need in required_files_by_kind.items()
            if need > 0 and have_by_kind.get(k, 0) < need
        ]
        if missing_required:
            logging.warning("ملفات مطلوبة مفقودة لأنواع: %s", ", ".join(missing_required))
            return {
                "error": _tr(ui_lang, "chat.no_files"),
                "result": None,
                "used_files": [],
                "used_files_data": [],
                "used_payload": _build_used_payload(username, sid, rq, [], True)
            }

    # إذا لا يزال لا توجد ملفات كافية وكان مطلوباً ملف
    if needs_file and not file_fnames:
        # نبني used_payload ونُعيده حتى مع رسالة الخطأ
        return {
            "error": _tr(ui_lang, "chat.no_files"),
            "result": None,
            "used_files": [],
            "used_files_data": [],
            "used_payload": _build_used_payload(username, sid, rq, [], True)
            }

    if not prompt_text and file_list and not needs_file:
        # رد إرشادي مبسّط + حفظ
        res_text = _tr(ui_lang, "chat.file_hint")
        if username != "guest":
            try:
                prev = load_chat_history(username, sid)
                msgs = prev.get("messages", [])
                msgs.append({
                    "timestamp": datetime.now().isoformat(),
                    "role": "user",
                    "content": text_raw,
                    "files": []
                })
                used_payload = _build_used_payload(username, sid, rq, [], False)
                msgs.append({
                    "timestamp": datetime.now().isoformat(),
                    "role": "assistant",
                    "content": res_text,
                    "used_payload": used_payload,
                    "files": []
                })
                save_chat_history(username, sid, msgs)
            except Exception as e:
                logging.error("فشل حفظ سجل الجلسة: %s", e)
        return {
            "result": res_text,
            "error": None,
            "used_files": [],
            "used_files_data": [],
            "used_payload": _build_used_payload(username, sid, rq, [], False)
        }

    auto_translate_arabic = rq.auto_translate_arabic
    if auto_translate_arabic is None:
        if username != "guest":
            try:
                _us = load_user_data(username, "settings") or {}
                auto_translate_arabic = bool(_us.get("auto_translate_arabic", True))
            except Exception as e:
                logging.warning("تعذر تحميل إعداد auto_translate_arabic: %s", e)
                auto_translate_arabic = True
        else:
            auto_translate_arabic = True

    if rq.is_regeneration and rq.effective_pos is not None:
        pos = sanitize(rq.effective_pos)
    else:
        pos = sanitize(translate(prompt_text) if auto_translate_arabic else prompt_text) if prompt_text else ""

    if rq.is_regeneration and rq.effective_neg is not None:
        neg = sanitize(rq.effective_neg)
    else:
        neg = sanitize(translate(neg_pre) if auto_translate_arabic else neg_pre) if neg_pre else ""
    
    # إزالة النقطة الزائدة من نهاية النص المترجم (إن وجدت)
    pos = pos.rstrip('.')
    neg = neg.rstrip('.')

    try:
        graph = patch_workflow(graph, pos, neg, node_specs, file_fnames)
    except Exception as e:
        logging.error("patch_workflow فشل: %s", e)
        return {
            "error": _tr(ui_lang, "workflow.patch_failed"),
            "result": None,
            "used_files": [],
            "used_files_data": [],
            "used_payload": _build_used_payload(username, sid, rq, [], needs_file)
        }

    res, err = comfy_send(graph, sid, result_spec, username,
                          multi_result_specs=all_result_specs if len(all_result_specs) > 1 else None)
    extra_results = MULTI_RESULTS.pop(sid, [])

    # (جديد) بعد التوليد: سجِّل كل المخرجات (primary + extras) في media_paths.txt
    raw_res = res
    raw_extra_results = list(extra_results)
    generated_media_urls: List[str] = []
    for _r in [raw_res] + raw_extra_results:
        if isinstance(_r, str) and _r.startswith("/media/"):
            generated_media_urls.append(_r)

    for _url in dict.fromkeys(generated_media_urls):
        _fname = os.path.basename(_url)
        out_full = os.path.join(COMFY_OUTPUT_DIR, _fname)
        if os.path.exists(out_full):
            append_user_media_index(username, out_full, "generated")
    
    # ✨ قراءة محتوى ملفات txt بدلاً من إرسال URL فقط
    if res and isinstance(res, str) and res.endswith(".txt"):
        try:
            with open(os.path.join(COMFY_OUTPUT_DIR, os.path.basename(res)), "r", encoding="utf-8") as f:
                res = f.read()
        except:
            pass

    # ✨ قراءة محتوى ملفات txt في extra_results أيضاً
    for ei, er in enumerate(extra_results):
        if isinstance(er, str) and er.endswith(".txt"):
            try:
                with open(os.path.join(COMFY_OUTPUT_DIR, os.path.basename(er)), "r", encoding="utf-8") as f:
                    extra_results[ei] = f.read()
            except:
                pass

    used_file_paths: list[str] = []
    for p in file_fnames:
        if os.path.isabs(p):
            fullp = p
        else:
            fullp = os.path.join(COMFY_INPUT_DIR, p)
        if os.path.exists(fullp):
            used_file_paths.append(fullp)

    used_files_data: list[str] = []
    for fullp in used_file_paths:
        try:
            used_files_data.append("/uploads/" + os.path.basename(fullp))
        except Exception as e:
            logging.warning("تعذر تحويل %s إلى base64: %s", fullp, e)

    # (جديد) نبني used_payload الفعلي الذي استُخدم
    used_payload = _build_used_payload(username, sid, rq, used_file_paths, needs_file, pos, neg)

    # حفظ سجل المحادثة
    if username != "guest":
        try:
            session_data = load_chat_history(username, sid)
            messages = session_data.get("messages", [])
            
            # إذا كان هذا إعادة توليد، لا نحفظ رسالة المستخدم (لأنها محفوظة مسبقاً)
            if not rq.is_regeneration:
                messages.append({
                    "timestamp": datetime.now().isoformat(),
                    "role": "user",
                    "content": text_raw,
                    "files": [os.path.basename(f) for f in used_file_paths] if used_file_paths else []
                })
            
            # دائماً نحفظ رد المساعد الجديد
            if res:
                assistant_record = {
                    "timestamp": datetime.now().isoformat(),
                    "role": "assistant",
                    "content": res,
                    "used_payload": used_payload,  # ← مهم لزر ⟳ بعد الاستعادة
                    "files": []  # لا حاجة لحفظ ملفات الـ assistant - الـ content يحتوي على المسار
                }
                if extra_results:
                    assistant_record["extra_results"] = extra_results
                messages.append(assistant_record)
            save_chat_history(username, sid, messages)
        except Exception as e:
            logging.error("فشل حفظ سجل المحادثة: %s", e)

    used_files_data = ([GEN_THUMBS.pop(sid)] if GEN_THUMBS.get(sid) else []) + used_files_data
    return {
        "result": res,
        "error": err,
        "extra_results": extra_results if extra_results else [],
        "used_files": used_file_paths,
        "used_files_data": used_files_data,
        "used_payload": used_payload,  # ← مهم أيضًا لتخزينه على الفقاعة مباشرة أثناء نفس الجلسة
    }

# ======== (جديد) أدوات حذف الوسائط من media_paths.txt ========
def _normalize_candidate_path(pth: str) -> str:
    if not isinstance(pth, str):
        return ""
    pth = pth.strip().strip('"').strip("'")
    pth = re.sub(r'\s+#.*$', '', pth).strip()
    return pth

def _extract_paths_from_line(line: str):
    paths = []
    if not line:
        return paths
    m_main = re.search(r'(?:uploaded|generated)\s*:\s*([^|]+)', line, flags=re.IGNORECASE)
    if m_main:
        raw = _normalize_candidate_path(m_main.group(1))
        if raw:
            paths.append(raw)
    m_csrc = re.search(r'comfy_src\s*:\s*(.+)$', line, flags=re.IGNORECASE)
    if m_csrc:
        raw = _normalize_candidate_path(m_csrc.group(1))
        if raw:
            paths.append(raw)
    return paths

def _parse_media_paths_from_index(index_path: str):
    files = []
    if not os.path.isfile(index_path):
        return set()
    try:
        with open(index_path, "r", encoding="utf-8") as f:
            for line in f:
                for pth in _extract_paths_from_line(line):
                    files.append(pth)
    except Exception:
        pass
    normed = set()
    for pth in files:
        p = pth.replace('/', '\\').strip()
        p = p.rstrip('|').strip()
        normed.add(p)
    return normed

def _delete_all_media_for_user(username: str):
    username = username or "guest"
    user_dir = get_user_dir(username)
    index_path = os.path.join(user_dir, "media_paths.txt")
    files = _parse_media_paths_from_index(index_path)

    deleted, missing, failed = [], [], []
    for raw_p in files:
        p = os.path.abspath(raw_p).replace('/', '\\')
        try:
            if os.path.isfile(p):
                try:
                    try:
                        os.chmod(p, 0o666)
                    except Exception:
                        pass
                    os.remove(p)
                    deleted.append(p)
                except Exception:
                    failed.append(p)
            else:
                missing.append(p)
        except Exception:
            failed.append(raw_p)

    # البحث عن ملفات باقية في مجلد temp الخاص بـ ComfyUI
    temp_deleted = 0
    if COMFY_HINT_TEMP and os.path.isdir(COMFY_HINT_TEMP):
        try:
            for fname in os.listdir(COMFY_HINT_TEMP):
                fpath = os.path.join(COMFY_HINT_TEMP, fname)
                # حذف فقط الملفات المتعلقة بـ easyui (التي تبدأ بـ u_)
                if os.path.isfile(fpath) and fname.startswith('u_'):
                    try:
                        try:
                            os.chmod(fpath, 0o666)
                        except:
                            pass
                        os.remove(fpath)
                        deleted.append(fpath)
                        temp_deleted += 1
                    except Exception as e:
                        logging.warning("فشل حذف ملف temp %s: %s", fpath, e)
                        failed.append(fpath)
        except Exception as e:
            logging.error("خطأ في فحص مجلد temp: %s", e)
    
    # backup & truncate
    if os.path.exists(index_path):
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup = os.path.join(user_dir, f"media_paths.deleted-{ts}.txt")
        try:
            os.replace(index_path, backup)
        except Exception:
            pass
        try:
            with open(index_path, "w", encoding="utf-8") as f:
                f.write("")
        except Exception:
            pass

    return {
        "deleted_count": len(deleted),
        "missing_count": len(missing),
        "failed_count": len(failed),
        "temp_cleaned": temp_deleted,
        "deleted": deleted[:100],
        "missing": missing[:100],
        "failed": failed[:100],
    }

# ======== REST APIs الموجودة + الجديدة ========
@app.get("/api/user/sessions")
async def get_user_sessions(username: str = "guest"):
    if username == "guest":
        return []
    return list_user_sessions(username)

@app.get("/api/user/session/{session_id}")
async def get_session_history(username: str, session_id: str):
    if username == "guest":
        lang = _resolve_ui_lang(username=username)
        return {"error": _tr(lang, "user.guest_history_forbidden")}
    return load_chat_history(username, session_id)

@app.delete("/api/user/session/{session_id}")
async def delete_session(username: str, session_id: str):
    if username == "guest":
        lang = _resolve_ui_lang(username=username)
        return {"error": _tr(lang, "user.guest_delete_forbidden")}
    success = delete_user_session(username, session_id)
    return {"success": success}

@app.get("/api/user/settings")
def get_user_settings(username: str = "guest"):
    if username == "guest":
        return {
            "username": "guest",
            "ui_language": DEFAULT_UI_LANGUAGE,
            "favorite_templates": [],
            "auto_cleanup": False,
            "cleanup_after_minutes": 5,
            "enable_tag_autocomplete": False,
            "tag_include_extra_quality": False,
            "tag_source_main": None,
            "chant_source_main": None,
            "auto_translate_arabic": True,
            "lm_enabled": False,
            "lm_button_hidden": False,
            "lm_translate_arabic": False,
            "ollama_model": "tinyllama:latest",
            "dark_mode": False,
            "success": True,
        }
    settings = load_user_data(username, "settings")
    return {
        "username": username,
        "ui_language": settings.get("ui_language", DEFAULT_UI_LANGUAGE),
        "favorite_templates": settings.get("favorite_templates", []),
        "auto_cleanup": settings.get("auto_cleanup", False),
        "cleanup_after_minutes": settings.get("cleanup_after_minutes", 5),
        "enable_tag_autocomplete": settings.get("enable_tag_autocomplete", False),
        "tag_include_extra_quality": settings.get("tag_include_extra_quality", False),
        "tag_source_main": _normalize_easy_tag_source(settings.get("tag_source_main"), "tags"),
        "chant_source_main": _normalize_easy_tag_source(settings.get("chant_source_main"), "chants"),
        "auto_translate_arabic": settings.get("auto_translate_arabic", True),
        "lm_enabled": settings.get("lm_enabled", False),
        "lm_button_hidden": settings.get("lm_button_hidden", False),
        "lm_translate_arabic": settings.get("lm_translate_arabic", False),
        "ollama_model": settings.get("ollama_model", "tinyllama:latest"),
        "dark_mode": settings.get("dark_mode", False),
        "success": True,
    }

@app.post("/api/user/settings")
def save_user_settings(settings: UserSettings):
    if settings.username == "guest":
        lang = _resolve_ui_lang(username=settings.username, ui_language=settings.ui_language)
        return {"success": False, "error": _tr(lang, "user.guest_settings_forbidden")}
    save_user_data(settings.username, "settings", {
        "ui_language": _normalize_ui_lang(settings.ui_language),
        "favorite_templates": settings.favorite_templates,
        "auto_cleanup": settings.auto_cleanup,
        "cleanup_after_minutes": settings.cleanup_after_minutes,
        "enable_tag_autocomplete": settings.enable_tag_autocomplete,
        "tag_include_extra_quality": settings.tag_include_extra_quality,
        "tag_source_main": _normalize_easy_tag_source(settings.tag_source_main, "tags"),
        "chant_source_main": _normalize_easy_tag_source(settings.chant_source_main, "chants"),
        "auto_translate_arabic": settings.auto_translate_arabic,
        "lm_enabled": settings.lm_enabled,
        "lm_button_hidden": settings.lm_button_hidden,
        "lm_translate_arabic": settings.lm_translate_arabic,
        "ollama_model": settings.ollama_model,
        "dark_mode": settings.dark_mode,
    })
    if settings.auto_cleanup:
        cleanup_user_files(settings.username, settings.cleanup_after_minutes)
    return {"success": True}

@app.post("/api/user/cleanup")
async def cleanup_files(username: str, older_than_minutes: int = None):
    if username == "guest":
        lang = _resolve_ui_lang(username=username)
        return {"error": _tr(lang, "user.guest_cleanup_forbidden")}
    cleanup_user_files(username, older_than_minutes)
    return {"success": True}

@app.get("/api/easy-tag/files")
async def list_tag_files():
    try:
        tags_dir = os.path.join(EASY_TAG_DIR, "tags")
        files = []
        if os.path.exists(tags_dir):
            for f in os.listdir(tags_dir):
                if f.lower().endswith(".json"):
                    files.append(f)
        return JSONResponse(content={"tags": sorted(files)})
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.get("/api/easy-tag/chant-files")
async def list_chant_files():
    try:
        chants_dir = os.path.join(EASY_TAG_DIR, "chants")
        files = []
        if os.path.exists(chants_dir):
            for f in os.listdir(chants_dir):
                if f.lower().endswith(".json"):
                    files.append(f)
        return JSONResponse(content={"chants": sorted(files)})
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

# ========== Plugins API ==========
@app.get("/api/plugins/list")
async def list_plugins():
    """قائمة جميع الإضافات المتاحة"""
    try:
        plugins = []
        if not os.path.exists(PLUGINS_DIR):
            return JSONResponse(content={"plugins": []})
        
        for plugin_folder in os.listdir(PLUGINS_DIR):
            plugin_path = os.path.join(PLUGINS_DIR, plugin_folder)
            if not os.path.isdir(plugin_path):
                continue
            
            manifest_path = os.path.join(plugin_path, "manifest.json")
            if not os.path.exists(manifest_path):
                continue
            
            try:
                with open(manifest_path, "r", encoding="utf-8") as f:
                    manifest = json.load(f)
                
                # إضافة المسار النسبي للأيقونة
                if manifest.get("icon"):
                    manifest["icon_url"] = f"/plugins/{plugin_folder}/{manifest['icon']}"
                
                manifest["folder"] = plugin_folder
                plugins.append(manifest)
            except Exception as e:
                logging.error(f"فشل تحميل manifest لـ {plugin_folder}: {e}")
                continue
        
        return JSONResponse(content={"plugins": plugins, "success": True})
    except Exception as e:
        logging.error(f"خطأ في قراءة الإضافات: {e}")
        return JSONResponse(content={"error": str(e), "plugins": []}, status_code=500)

@app.get("/api/plugins/toggle/{plugin_id}")
async def toggle_plugin(plugin_id: str, enabled: bool = Query(True)):
    """تفعيل أو تعطيل إضافة"""
    try:
        plugin_path = os.path.join(PLUGINS_DIR, plugin_id)
        manifest_path = os.path.join(plugin_path, "manifest.json")
        
        if not os.path.exists(manifest_path):
            lang = _resolve_ui_lang(username="guest")
            return JSONResponse(content={"error": _tr(lang, "plugins.not_found")}, status_code=404)
        
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)
        
        manifest["enabled"] = enabled
        
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)
        
        return JSONResponse(content={"success": True, "enabled": enabled})
    except Exception as e:
        logging.error(f"فشل تعديل حالة الإضافة {plugin_id}: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)

# (جديد) حذف كل الوسائط للمستخدم (POST JSON + GET للاختبار)
@app.api_route("/api/user/delete_all_media", methods=["POST"])
async def delete_all_media(req: DeleteAllMediaReq):
    try:
        username = (req.username or "guest").strip()
        res = _delete_all_media_for_user(username)
        return {"success": True, **res}
    except Exception as e:
        lang = _resolve_ui_lang(username=(req.username or "guest"), ui_language=req.ui_language)
        return {"success": False, "error": _tr(lang, "common.unexpected_with_error", error=str(e))}

@app.get("/api/user/delete_all_media")
async def delete_all_media_get(username: str = Query("guest")):
    try:
        res = _delete_all_media_for_user(username.strip() or "guest")
        return {"success": True, **res}
    except Exception as e:
        return {"success": False, "error": str(e)}

# ————— API My Prompt —————

@app.post("/api/my_prompt/save")
async def save_my_prompt(request: Request):
    """حفظ My Prompt (صورة + نص) في مجلد المستخدم"""
    try:
        data = await request.json()
        username = (data.get("username") or "guest").strip()
        ui_lang = _resolve_ui_lang(username=username, ui_language=data.get("ui_language"), request=request)
        image_base64 = data.get("image", "")
        text = data.get("text", "").strip()
        
        if not image_base64 or not text:
            return {"success": False, "error": _tr(ui_lang, "myprompt.missing_data")}
        
        # إنشاء مجلد My Prompt للمستخدم
        user_dir = os.path.join(USERS_DIR, username)
        my_prompt_dir = os.path.join(user_dir, "my_prompt")
        os.makedirs(my_prompt_dir, exist_ok=True)
        
        # معرف فريد للـ My Prompt
        prompt_id = str(int(time.time() * 1000))
        
        # حفظ الصورة
        try:
            # فك ترميز base64
            if image_base64.startswith("data:"):
                image_base64 = image_base64.split(",", 1)[1]
            
            image_data = base64.b64decode(image_base64)
            image_path = os.path.join(my_prompt_dir, f"{prompt_id}.png")
            with open(image_path, "wb") as f:
                f.write(image_data)
        except Exception as e:
            logging.error(f"فشل حفظ صورة My Prompt: {e}")
            return {"success": False, "error": _tr(ui_lang, "myprompt.save_image_failed", error=str(e))}
        
        # حفظ النص في ملف
        try:
            text_path = os.path.join(my_prompt_dir, f"{prompt_id}.txt")
            with open(text_path, "w", encoding="utf-8") as f:
                f.write(text)
        except Exception as e:
            logging.error(f"فشل حفظ نص My Prompt: {e}")
            return {"success": False, "error": _tr(ui_lang, "myprompt.save_text_failed", error=str(e))}
        
        return {"success": True, "template_id": prompt_id}
    except Exception as e:
        logging.error(f"خطأ في حفظ My Prompt: {e}")
        return {"success": False, "error": str(e)}

@app.post("/api/my_prompt/list")
async def list_my_prompts(request: Request):
    """تحميل قائمة My Prompt للمستخدم"""
    try:
        data = await request.json()
        username = (data.get("username") or "guest").strip()
        
        my_prompt_dir = os.path.join(USERS_DIR, username, "my_prompt")
        
        if not os.path.exists(my_prompt_dir):
            return {"success": True, "templates": []}
        
        templates = []
        
        # قراءة جميع الملفات النصية
        for txt_file in sorted(glob.glob(os.path.join(my_prompt_dir, "*.txt"))):
            prompt_id = os.path.basename(txt_file).replace(".txt", "")
            png_file = os.path.join(my_prompt_dir, f"{prompt_id}.png")
            
            # تحقق من وجود الصورة المرتبطة
            if not os.path.exists(png_file):
                continue
            
            try:
                with open(txt_file, "r", encoding="utf-8") as f:
                    text = f.read().strip()
                
                # احصل على معلومات الملف
                created_time = os.path.getctime(png_file)
                
                templates.append({
                    "id": prompt_id,
                    "text": text,
                    "created": datetime.fromtimestamp(created_time).isoformat()
                })
            except Exception as e:
                logging.error(f"فشل قراءة My Prompt {prompt_id}: {e}")
                continue
        
        # ترتيب تنازلي حسب وقت الإنشاء
        templates.sort(key=lambda x: x["created"], reverse=True)
        
        return {"success": True, "templates": templates}
    except Exception as e:
        logging.error(f"خطأ في تحميل My Prompts: {e}")
        return {"success": False, "error": str(e), "templates": []}

@app.get("/api/my_prompt/image/{prompt_id}")
async def get_my_prompt_image(prompt_id: str, username: str = Query("guest")):
    """تحميل صورة My Prompt"""
    try:
        username = (username or "guest").strip()
        image_path = os.path.join(USERS_DIR, username, "my_prompt", f"{prompt_id}.png")
        
        if not os.path.exists(image_path):
            lang = _resolve_ui_lang(username=username)
            return {"error": _tr(lang, "myprompt.image_not_found")}
        
        return FileResponse(image_path, media_type="image/png")
    except Exception as e:
        logging.error(f"خطأ في تحميل صورة My Prompt: {e}")
        return {"error": str(e)}

@app.post("/api/my_prompt/delete")
async def delete_my_prompt(request: Request):
    """حذف My Prompt"""
    try:
        data = await request.json()
        prompt_id = data.get("template_id")
        username = (data.get("username") or "guest").strip()
        ui_lang = _resolve_ui_lang(username=username, ui_language=data.get("ui_language"), request=request)
        
        if not prompt_id:
            return {"success": False, "error": _tr(ui_lang, "myprompt.id_missing")}
        
        my_prompt_dir = os.path.join(USERS_DIR, username, "my_prompt")
        image_path = os.path.join(my_prompt_dir, f"{prompt_id}.png")
        text_path = os.path.join(my_prompt_dir, f"{prompt_id}.txt")
        
        # حذف الملفات
        try:
            if os.path.exists(image_path):
                os.remove(image_path)
            if os.path.exists(text_path):
                os.remove(text_path)
        except Exception as e:
            logging.error(f"فشل حذف My Prompt {prompt_id}: {e}")
            return {"success": False, "error": _tr(ui_lang, "myprompt.delete_failed", error=str(e))}
        
        return {"success": True}
    except Exception as e:
        logging.error(f"خطأ في حذف My Prompt: {e}")
        return {"success": False, "error": str(e)}

@app.get("/", include_in_schema=False)
def index():
    return FileResponse(os.path.join(WEB_DIR, "index.html"))


# --- EasyUi: serve /favicon.ico from web/ or redirect to /static ---
@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    path = os.path.join(WEB_DIR, "favicon.ico")
    if os.path.exists(path):
        return FileResponse(path)
    return RedirectResponse(url="/static/favicon.ico", status_code=308)

if __name__ == "__main__":
    port = int(os.getenv("PORT", "50030"))
    uvicorn.run(app, host="0.0.0.0", port=port)
