
#!/usr/bin/env python3
"""
Auto CSV→JSON converter for easy-tag/tags
- Converts every *.csv under easy-tag/tags into a compact JSON array.
- On success, deletes the original CSV file.
Usage:
  python tools/auto_csv_to_json.py
  python tools/auto_csv_to_json.py path\to\easy-tag\tags
Notes:
- Safe to run multiple times.
- CSV format expected: name,type,count,"alias1,alias2" (variants tolerated).
"""
import csv, json, sys, pathlib, re

def convert_one(csv_path: pathlib.Path) -> int:
    rows = []
    with csv_path.open('r', encoding='utf-8', newline='') as f:
        reader = csv.reader(f)
        first = True
        for row in reader:
            if not row:
                continue
            # skip header if present
            if first and any(re.search(r'(name|tag)', (row[i] if i<len(row) else ''), re.I) for i in range(min(2,len(row)))):
                first = False
                continue
            first = False
            name = (row[0] or '').strip() if len(row)>0 else ''
            if not name or name.startswith('#'):
                continue
            t = (row[1] or '').strip() if len(row)>1 else ''
            c = (row[2] or '').strip() if len(row)>2 else ''
            a = (row[3] or '').strip() if len(row)>3 else ''
            try:
                tnum = int(t) if t and re.fullmatch(r'-?\d+', t) else None
            except: tnum = None
            try:
                cnum = int(c) if c and re.fullmatch(r'\d+', c) else None
            except: cnum = None
            aliases = []
            if a:
                a = a.strip('"')
                aliases = [x.strip() for x in re.split(r'[|,]', a) if x.strip()]
            rows.append({
                "name": name,
                "type": tnum,
                "count": cnum,
                "aliases": aliases
            })
    json_path = csv_path.with_suffix('.json')
    json_path.write_text(json.dumps(rows, ensure_ascii=False, separators=(',',':')), encoding='utf-8')
    # delete CSV on success
    csv_path.unlink(missing_ok=True)
    return len(rows)

def main():
    if len(sys.argv) > 2:
        print("Usage: python tools/auto_csv_to_json.py [easy-tag/tags path]")
        sys.exit(1)
    if len(sys.argv) == 2:
        tags_dir = pathlib.Path(sys.argv[1]).resolve()
    else:
        tags_dir = pathlib.Path.cwd() / 'easy-tag' / 'tags'
    if not tags_dir.exists():
        print(f"[!] Not found: {tags_dir}")
        sys.exit(2)

    total_files = 0
    total_tags = 0
    for p in tags_dir.rglob('*.csv'):
        n = convert_one(p)
        print(f"[OK] {p.name} → {p.with_suffix('.json').name}  ({n} tags)  [CSV deleted]")
        total_files += 1
        total_tags += n
    print(f"Done. Converted {total_files} file(s), total {total_tags} tags.")

if __name__ == '__main__':
    main()
