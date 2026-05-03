
import csv, json, sys, pathlib

def csv_to_json(csv_path, json_path):
    rows = []
    with open(csv_path, newline='', encoding='utf-8') as csvfile:
        reader = csv.reader(csvfile)
        for row in reader:
            if not row or (row[0] and row[0].startswith('#')): 
                continue
            name = (row[0] or '').strip()
            t = int(row[1]) if len(row)>1 and (row[1] or '').strip().lstrip('-').isdigit() else None
            count = int(row[2]) if len(row)>2 and (row[2] or '').strip().isdigit() else None
            aliases = []
            if len(row)>3 and row[3]:
                cell = row[3].strip().strip('"')
                aliases = [a.strip() for a in cell.replace('|', ',').split(',') if a.strip()]
            rows.append({"name": name, "type": t, "count": count, "aliases": aliases})
    pathlib.Path(json_path).write_text(json.dumps(rows, ensure_ascii=False), encoding='utf-8')
    print(f"OK → {json_path} ({len(rows)} tags)")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python tools/convert_tags_csv_to_json.py <input.csv> <output.json>")
        sys.exit(1)
    csv_to_json(sys.argv[1], sys.argv[2])
