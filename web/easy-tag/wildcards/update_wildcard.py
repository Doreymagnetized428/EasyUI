#!/usr/bin/env python3
"""
generate_manifest.py — يولّد/يحدّث ملف _manifest.json داخل هذا المجلد.
"""

import os, json

def main():
    root = os.path.dirname(os.path.abspath(__file__))  # موقع هذا الملف نفسه
    out_path = os.path.join(root, "_manifest.json")

    wildcards = []
    for dirpath, _, files in os.walk(root):
        for f in files:
            if f.startswith("_"):
                continue
            if not f.lower().endswith(('.txt', '.text')):
                continue
            rel = os.path.relpath(os.path.join(dirpath, f), root)
            rel = rel.replace("\\", "/")
            # أزل الامتداد
            rel = os.path.splitext(rel)[0]
            wildcards.append(rel)

    wildcards = sorted(set(wildcards), key=lambda s: s.lower())
    data = {"wildcards": wildcards}

    with open(out_path, "w", encoding="utf-8") as fp:
        json.dump(data, fp, ensure_ascii=False, indent=2)

    print(f"تم تحديث {out_path} بعدد {len(wildcards)} ملف.")

if __name__ == "__main__":
    main()
