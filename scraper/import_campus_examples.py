#!/usr/bin/env python3
"""Add answer-supported DI and pattern examples from the supplied Campus book."""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

def main():
    quant_path = DATA / "quant.json"
    reasoning_path = DATA / "reasoning.json"
    quant = json.loads(quant_path.read_text(encoding="utf-8"))
    reasoning = json.loads(reasoning_path.read_text(encoding="utf-8"))
    shared = "| Year | Imports (crore) | Exports (crore) |\n|---|---:|---:|\n| 2000–2001 | 300 | 400 |\n| 2001–2002 | 500 | 600 |\n| 2002–2003 | 600 | 500 |\n| 2003–2004 | 550 | 150 |\n| 2004–2005 | 400 | 350 |"
    additions_q = [
      ("campus-book-di-38-01", "data-interpretation", "In which year was the gap between imports and exports maximum?", ["2001–2002", "2002–2003", "2003–2004", "2004–2005"], 2, "The 2003–2004 difference is 550−150=400 crore, the largest in the table.", "Bar Graphs", 38),
      ("campus-book-di-38-02", "data-interpretation", "In which year was the gap between imports and exports minimum?", ["2002–2003", "2003–2004", "2004–2005", "None of these"], 2, "The 2004–2005 difference is 400−350=50 crore, the smallest in the table.", "Bar Graphs", 38),
    ]
    def add(path, rows, records):
        seen_ids={x["id"] for x in rows}; seen_stems={re.sub(r"[^a-z0-9]+","",x["question"].casefold()) for x in rows}
        added=0
        for rec in records:
            if rec["id"] in seen_ids or re.sub(r"[^a-z0-9]+","",rec["question"].casefold()) in seen_stems: continue
            rows.append(rec); seen_ids.add(rec["id"]); seen_stems.add(re.sub(r"[^a-z0-9]+","",rec["question"].casefold())); added+=1
        path.write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding="utf-8")
        return added
    qrows=[]
    for ident,topic,question,options,answer,explanation,section,page in additions_q:
        qrows.append({"id":ident,"category":"quant","topic":topic,"source_topic":section,"difficulty":"medium","question":question,"passage":shared,"options":options,"answer":answer,"explanation":explanation,"images":[],"source":"CampusRecruitmentBook","url":f"data/sources/CampusRecruitmentBook.pdf#page={page}"})
    pattern_data=[
      ("campus-book-pattern-01", "In the three diamond number figures, which value replaces the question mark?", ["23","18","22","21","None of these"], 0, "For figure (a), 9+5+3=17, then 17+3=20. For (b), 2+6+8=16, then 16+3=19. For (c), 7+9+4=20, then 20+3=23.", 1),
      ("campus-book-pattern-02", "In the three spoke diagrams, which centre number replaces the question mark?", ["236","336","286","386","436"], 2, "Multiply the three top numbers and add the product of the three bottom numbers. For the third figure, 4×5×8 + 6×7×3 = 286.", 2),
      ("campus-book-pattern-03", "In the three branching number figures, which bottom number replaces the question mark?", ["81","84","516","514","86"], 2, "The bottom value is the sum of the cubes of the two top values. For the third figure, 8³+2²=512+4=516.", 3),
      ("campus-book-pattern-04", "In the three inverted-triangle number figures, which centre number replaces the question mark?", ["79","89","99","69","109"], 0, "The centre is the top value multiplied by the left value, then added to the right value. For the last figure, 12×6+7=79.", 4),
      ("campus-book-pattern-05", "In the three circle arrangements, which centre number replaces the question mark?", ["229","134","329","439","339"], 1, "Add the squares of the four outer values. For the third arrangement, 8²+6²+3²+5²=134.", 5),
      ("campus-book-pattern-06", "In the number matrix, which value replaces the question mark?", ["8","16","4","2","None of these"], 3, "Each column follows (top × second-row) ÷ third-row = bottom. In column three, (16×? )÷8=4, so ?=2.", 6),
      ("campus-book-pattern-07", "In the three paired-square figures, which outside number replaces the question mark?", ["108","46","64","104","Cannot be determined"], 0, "The outside value is the difference of the squares of the two inside values. For the third figure, 12²−6²=108.", 7),
      ("campus-book-pattern-08", "In the letter-and-number matrix, which pair replaces the question mark?", ["M37","N36","O37","M36","M38"], 0, "Down each column, the letter advances by one and the number increases by 11. The missing pair is M37.", 8),
    ]
    rrows=[]
    for ident,question,options,answer,explanation,imgno in pattern_data:
        images=[] if imgno in (6,8) else [f"data/images/campus-pattern-q{imgno}.png"]
        passage=None
        if imgno==6: passage="| 12 | 19 | 16 |\n|---:|---:|---:|\n| 4 | 3 | ? |\n| 6 | 3 | 8 |\n| 8 | 19 | 4 |"
        if imgno==8: passage="| A₅ | F₁₀ | K₁₅ |\n|---|---|---|\n| B₁₆ | G₂₁ | L₂₆ |\n| C₂₇ | H₃₂ | ? |"
        rrows.append({"id":ident,"category":"reasoning","topic":"non-verbal","source_topic":"Character Puzzle","difficulty":"medium","question":question,"passage":passage,"options":options,"answer":answer,"explanation":explanation,"images":images,"source":"CampusRecruitmentBook","url":"data/sources/CampusRecruitmentBook.pdf#page=58"})
    print(f"Campus book: added DI={add(quant_path,quant,qrows)}, pattern={add(reasoning_path,reasoning,rrows)}")

if __name__=="__main__": main()
