#!/usr/bin/env python3
"""Import answer-key-backed multiple-choice assignments from CMP332 PDF."""
from __future__ import annotations
import json, re, sys, unicodedata
from pathlib import Path
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "data" / "sources" / "CMP332_Quantative-Aptitude.pdf"
DATA = ROOT / "data"

# (first question page, answer-key page, source section, default topic)
SETS = [
    (31, 35, "Number System", "number-system"),
    (51, 56, "Percentages", "percentages"),
    (67, 70, "Profit and Loss", "profit-loss"),
    (84, 85, "Simple Interest", "simple-interest"),
    (96, 97, "Compound Interest", "compound-interest"),
    (114, 118, "Ratio and Proportion", "ratio-proportion"),
    (132, 135, "Mixtures and Alligations", "mixtures-alligation"),
    (150, 153, "Averages and Problems on Ages", "averages"),
    (169, 173, "Time and Work", "time-work"),
    (189, 194, "Time Speed and Distance", "time-speed-distance"),
    (206, 211, "Problems on Trains", "trains"),
    (226, 228, "Permutations and Combinations", "permutation-combination"),
    (240, 245, "Probability", "probability"),
]
QSTART = re.compile(r"(?m)^\s*(\d{1,2})\s*\.\s+")
OPT = re.compile(r"(?<![A-Za-z0-9])([a-e])(?:[.)]\s*|(?=\s))", re.I)
PAIR = re.compile(r"(?<![A-Za-z0-9])(\d{1,2})\s+([a-e])\b", re.I)

def clean(text: str) -> str:
    text = unicodedata.normalize("NFKC", text.replace("\u00a0", " ").replace("\u200b", " "))
    text = text.replace("\x00", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n+ *", "\n", text)
    return text.strip()

def norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", text.casefold())

def question_blocks(text: str):
    matches = list(QSTART.finditer(text))
    for i, match in enumerate(matches):
        number = int(match.group(1))
        if not 1 <= number <= 30:
            continue
        block = text[match.end():matches[i+1].start() if i+1 < len(matches) else len(text)]
        # Find the first complete a/b/c/d(/e) option run; stray e.g. and prose labels
        # do not form a sequential run and are ignored.
        marks = list(OPT.finditer(block))
        chosen = None
        for j, mark in enumerate(marks):
            if mark.group(1).lower() != "a":
                continue
            run = [mark]
            expect = "b"
            for candidate in marks[j+1:]:
                label = candidate.group(1).lower()
                if label == expect:
                    run.append(candidate)
                    expect = chr(ord(expect)+1)
                    if expect == "f":
                        break
                elif label == "a":
                    break
            if len(run) >= 4:
                chosen = run
                break
        if not chosen:
            continue
        stem = clean(block[:chosen[0].start()])
        options = []
        for k, mark in enumerate(chosen):
            end = chosen[k+1].start() if k+1 < len(chosen) else len(block)
            body = clean(block[mark.end():end])
            # Discard trailing page folios, assignment headers, and non-option key text.
            body = re.split(r"(?i)\b(?:answer\s*key|q\.?\s*no\.?\s*ans|unit\s*-?\s*\d+)\b", body)[0]
            body = re.sub(r"(?im)^\s*(?:Logon to|Login to|www\.)\S.*$", "", body).strip()
            options.append(body)
        if stem and all(options) and len(options) >= 4:
            yield number, stem, options

def topic_for(section: str, stem: str, default: str) -> str:
    s = stem.casefold()
    if "pipe" in s or "tank" in s and any(x in s for x in ("fill", "empty", "leak")):
        return "pipes-cisterns"
    if "train" in s or "platform" in s or "telegraphic pole" in s:
        return "trains"
    if any(x in s for x in ("boat", "stream", "upstream", "downstream")):
        return "boats-streams"
    if "age" in s or "years old" in s:
        return "ages"
    if "average" in s or "mean" in s:
        return "averages"
    if any(x in s for x in ("mixture", "mix ", "milk and water", "alligation")):
        return "mixtures-alligation"
    if any(x in s for x in ("profit", "loss", "cost price", "selling price", "gain")):
        return "profit-loss"
    if "probability" in s or "probability" in section.casefold():
        return "probability"
    if any(x in s for x in ("permutation", "combination", "ways can", "arrange")) or "permutation" in section.casefold():
        return "permutation-combination"
    return default

def get_key(text: str) -> dict[int, str]:
    # The answer grid is on the final page of each assigned set. Take content only
    # after its heading to avoid pairing numbers from the last question/options.
    headings = list(re.finditer(r"(?i)(?:answer\s*keys?|answers\s*keys?|answers?\s*:)", text))
    if not headings:
        return {}
    tail = text[headings[-1].end():]
    out = {}
    for m in PAIR.finditer(tail):
        qnum = int(m.group(1))
        if 1 <= qnum <= 30:
            out[qnum] = m.group(2).lower()
    return out

def main():
    if not PDF.exists():
        raise SystemExit(f"Missing source PDF: {PDF}")
    reader = PdfReader(str(PDF))
    page_text = [clean(p.extract_text() or "") for p in reader.pages]
    all_records = []
    for first, key_page, section, default_topic in SETS:
        # Keep questions printed before the answer grid when both share the last page.
        key_text = page_text[key_page-1]
        key_headings = list(re.finditer(r"(?i)(?:answer\s*keys?|answers\s*keys?|answers?\s*:)", key_text))
        key_start = key_headings[-1].start() if key_headings else len(key_text)
        question_text = "\n".join(page_text[first-1:key_page-1] + [key_text[:key_start]])
        keys = get_key(page_text[key_page-1])
        found = list(question_blocks(question_text))
        n_added = 0
        for n, stem, options in found:
            letter = keys.get(n)
            if not letter:
                continue
            answer = ord(letter)-ord("a")
            if answer >= len(options):
                continue
            topic = topic_for(section, stem, default_topic)
            all_records.append({
                "id": f"cmp332-{topic}-{first:03d}-{n:02d}",
                "category": "quant", "topic": topic, "source_topic": section,
                "difficulty": None, "question": stem, "passage": None,
                "options": options, "answer": answer, "explanation": None,
                "images": [], "source": "cmp332", "url": f"data/sources/CMP332_Quantative-Aptitude.pdf#page={first}"
            })
        # Two source questions have malformed option labels/spacing in the PDF text layer.
        # Their stems, options, and keyed answers are legible in the source pages.
        if first == 150:
            all_records.extend([
                {
                    "id": "cmp332-averages-150-11", "category": "quant", "topic": "averages",
                    "source_topic": section, "difficulty": None,
                    "question": "There is a sequence of 11 consecutive even numbers. The average of the first 7 numbers is A. What is the average of all 11 numbers?",
                    "passage": None, "options": ["7", "7 + A", "A", "A + 4"], "answer": 3,
                    "explanation": "The average of the first seven terms is the fourth term. The average of all eleven terms is the sixth term, two steps later; consecutive even terms differ by 2, so the full-sequence average is A + 4.",
                    "images": [], "source": "cmp332", "url": "data/sources/CMP332_Quantative-Aptitude.pdf#page=150"
                },
                {
                    "id": "cmp332-averages-150-15", "category": "quant", "topic": "averages",
                    "source_topic": section, "difficulty": None,
                    "question": "The average of seven numbers is 5. If the average of the first six numbers is 4, what is the seventh number?",
                    "passage": None, "options": ["14", "12", "11", "15"], "answer": 2,
                    "explanation": "The total of seven numbers is 7×5=35. The first six total 6×4=24, so the seventh number is 35−24=11. The source key marks option C.",
                    "images": [], "source": "cmp332", "url": "data/sources/CMP332_Quantative-Aptitude.pdf#page=153"
                }
            ])
        parsed_nums = {item[0] for item in found}
        print(f"{section}: {len(found)} questions parsed, {len(keys)} key entries; missing {sorted(set(keys)-parsed_nums)}")
    # Idempotent merge and normalized-question deduplication.
    for category in ("quant", "reasoning", "verbal"):
        path = DATA / f"{category}.json"
        rows = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
        bytext = {norm(r["question"]): r for r in rows}
        byid = {r["id"] for r in rows}
        added = 0
        for row in all_records:
            if row["category"] != category or row["id"] in byid:
                continue
            key = norm(row["question"])
            if key in bytext:
                continue
            rows.append(row); bytext[key] = row; byid.add(row["id"]); added += 1
        path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
        if added:
            print(f"{category}: added {added}")

if __name__ == "__main__":
    main()
