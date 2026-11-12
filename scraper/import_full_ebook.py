#!/usr/bin/env python3
"""Import answer-backed MCQs from the user's 676-page quantitative aptitude ebook."""
from __future__ import annotations
import json, re, unicodedata
from collections import Counter
from pathlib import Path
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
PDF = DATA / "sources" / "QUANTITATIVE-APTITUDE-FULL-EBOOK.pdf"
START = re.compile(r"(?m)^\s*(\d{1,3})\s*[.)]\s+")
OPTION = re.compile(r"(?i)(?<![A-Za-z0-9])([a-d])[.)]\s*")
ANSWER = re.compile(r"(?im)\bAnswer\s*:\s*([a-d])\b(?:[ \t]*\(([^)\r\n]+)\)|[ \t]*[.)][ \t]*([^\r\n]+))?")

def clean(s: str) -> str:
    s = unicodedata.normalize("NFKC", s.replace("\x00", " ").replace("\u00a0", " ").replace("\ufffd", "×"))
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r" *\n+ *", "\n", s)
    return s.strip()

def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", s.casefold())

def topic_for(page: int, stem: str) -> tuple[str, str]:
    s = stem.casefold()
    if page >= 642: return "data-interpretation", "Data Interpretation"
    if page < 19: return "simplification", "Speed Maths"
    if page < 36: return "simplification", "Additions and Subtractions"
    if page < 60: return "simplification", "Split and Merge"
    if page < 91: return "simplification", "Division"
    if page < 109: return "percentages", "Percentage"
    if page < 136: return "number-system", "Squares"
    if page < 160: return "number-system", "Cubes"
    if page < 194: return "simplification", "Simplification and Approximation"
    if page < 228: return "number-system", "Number System"
    if page < 246: return "hcf-lcm", "LCM and HCF"
    if page < 263: return "algebra", "Equations"
    if page < 291: return "number-system", "Number Series"
    if page < 324: return "averages", "Average"
    if page < 344: return "percentages", "Percentages"
    if page < 360: return "profit-loss", "Profit and Loss"
    if page < 380: return "simple-interest", "Simple and Compound Interest"
    if page < 402: return "compound-interest", "Simple and Compound Interest"
    if page < 434: return "ratio-proportion", "Ratio and Proportion"
    if page < 456: return "mixtures-alligation", "Alligations and Mixtures"
    if page < 482: return "ages", "Ages"
    if page < 509: return "partnership", "Partnership"
    if page < 538: return "time-work", "Time and Work"
    if page < 556: return "time-speed-distance", "Speed, Time, and Distance"
    if page < 581: return "area-volume", "Mensuration"
    if page < 619: return "permutation-combination", "Permutation and Combination"
    if page < 640: return "probability", "Probability"
    for topic, terms in [("time-work", ("work", "pipe", "tank")), ("time-speed-distance", ("speed", "distance", "train", "boat")), ("profit-loss", ("profit", "loss", "cost price", "selling price")), ("averages", ("average", "mean")), ("probability", ("probability", "random")), ("ratio-proportion", ("ratio", "proportion")), ("ages", ("age", "years old")), ("data-interpretation", ("table", "graph", "chart", "survey"))]:
        if any(x in s for x in terms): return topic, "Mixed Quantitative Aptitude"
    return "other", "Mixed Quantitative Aptitude"

def option_run(text: str):
    marks = list(OPTION.finditer(text))
    for i, m in enumerate(marks):
        if m.group(1).lower() != "a": continue
        run = [m]; expect = "b"
        for cand in marks[i+1:]:
            label = cand.group(1).lower()
            if label == expect:
                run.append(cand); expect = chr(ord(expect)+1)
                if expect == "e": break
            elif label == "a": break
        if len(run) >= 4:
            return run
    return []

def main():
    reader = PdfReader(str(PDF))
    rows=[]; rejects=[]; corrections=[]; stats=Counter(); category_path=DATA/"quant.json"
    existing=[x for x in json.loads(category_path.read_text(encoding="utf-8")) if x.get("source")!="quantitative-aptitude-ebook"]
    seen={norm(x["question"]) for x in existing}
    for page_i, page in enumerate(reader.pages, 1):
        text=clean(page.extract_text() or "")
        starts=list(START.finditer(text))
        for j,m in enumerate(starts):
            block=text[m.end():starts[j+1].start() if j+1<len(starts) else len(text)]
            am=ANSWER.search(block)
            if not am:
                # Some items put the marked option only in the last sentence.
                am2=list(re.finditer(r"(?i)\boption\s+([a-d])\s+is\s+correct\b",block))
                am3=list(re.finditer(r"(?i)\banswer\s+is\s*\(([a-d])\)",block))
                mm=(am2 or am3)
                if mm:
                    class A: pass
                    am=A(); am.start=lambda: mm[-1].start(); am.end=lambda: mm[-1].end(); am.group=lambda n: mm[-1].group(1) if n==1 else None
                    answer_letter=mm[-1].group(1).lower()
                else: continue
            else: answer_letter=am.group(1).lower()
            stats["keyed_blocks"]+=1
            solmark=re.search(r"(?i)\bSolution\s*:",block)
            option_end=min([i for i in (am.start(), solmark.start() if solmark else None) if i is not None])
            before=block[:option_end]
            # A complete sequential A-D option run must occur before the solution.
            marks=option_run(before)
            if not marks:
                stats["no_option_run"]+=1; continue
            stem=clean(before[:marks[0].start()])
            opts=[]
            for k,mark in enumerate(marks):
                end=marks[k+1].start() if k+1<len(marks) else len(before)
                body=clean(before[mark.end():end])
                if body: opts.append(body)
            answer=ord(answer_letter)-97
            if len(opts)<4 or answer>=len(opts) or len(stem)<12:
                stats["incomplete"]+=1; continue
            if solmark:
                solution_end=am.start() if am.start()>solmark.start() else len(block)
                solution=clean(block[solmark.end():solution_end])
            else:
                solution=clean(block[am.end():]) if am.end()<=len(block) else ""
            if not solution and hasattr(am,"start"): solution=clean(block)
            key_value=(am.group(2) or am.group(3)) if hasattr(am,"group") else None
            # Some source keys give the correct value beside the wrong option letter.
            # Prefer a unique option matching that printed value when the worked
            # solution does not contradict its option letter.
            if key_value:
                key_value=re.split(r"(?i)\s*Solution\s*:",key_value)[0].strip()
                matches=[i for i,opt in enumerate(opts) if norm(key_value)==norm(opt)]
                if len(matches)==1 and matches[0]!=answer:
                    corrections.append({"page":page_i,"question_number":int(m.group(1)),"printed_letter":answer_letter.upper(),"corrected_letter":"ABCD"[matches[0]],"printed_value":key_value})
                    answer=matches[0]; answer_letter="abcd"[answer]
            # Reject a clearly contradictory final answer label in the worked explanation.
            explicit=list(re.finditer(r"(?i)\banswer\s+is\s+(?:option\s*)?\(?([a-d])\)?|\boption\s+([a-d])\s+is\s+correct\b",solution))
            final_letter=(explicit[-1].group(1) or explicit[-1].group(2)).lower() if explicit else None
            mismatch=bool(final_letter and final_letter!=answer_letter)
            # If the key prints a value that is not any choice, the key cannot be resolved.
            if key_value and norm(key_value) not in {norm(x) for x in opts}: mismatch=True
            if mismatch:
                stats["contradictions"]+=1
                rejects.append({"page":page_i,"question_number":int(m.group(1)),"stem":stem[:250],"options":opts,"marked_answer":opts[answer],"reason":"Printed solution concludes with a different option/value."})
                continue
            topic,section=topic_for(page_i,stem)
            ident=f"quantitative-ebook-p{page_i:03d}-q{int(m.group(1)):02d}"
            if norm(stem) in seen:
                stats["duplicates"]+=1; continue
            seen.add(norm(stem))
            rows.append({"id":ident,"category":"quant","topic":topic,"source_topic":section,"difficulty":None,"question":stem,"passage":None,"options":opts,"answer":answer,"explanation":solution or None,"images":[],"source":"quantitative-aptitude-ebook","url":f"data/sources/QUANTITATIVE-APTITUDE-FULL-EBOOK.pdf#page={page_i}"})
    existing.extend(rows)
    category_path.write_text(json.dumps(existing,ensure_ascii=False,indent=2),encoding="utf-8")
    (DATA/"ebook_rejected.json").write_text(json.dumps(rejects,ensure_ascii=False,indent=2),encoding="utf-8")
    (DATA/"ebook_key_corrections.json").write_text(json.dumps(corrections,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps({"pages":len(reader.pages),"stats":stats,"added":len(rows),"rejected_contradictions":len(rejects),"total_quant_before_finalize":len(existing)},ensure_ascii=False))

if __name__=="__main__": main()
