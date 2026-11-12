#!/usr/bin/env python3
"""Add the five answer-explained questions from IndiaBIX Pie Chart exercise 1."""
import json, re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PATH=ROOT/'data'/'quant.json'
URL='https://www.indiabix.com/data-interpretation/pie-charts/'
PASSAGE='''Publishing cost distribution values used in the source questions:\n\n| Expense | Share of total cost |\n|---|---:|\n| Paper | 25% |\n| Printing | 20% |\n| Royalty | 15% |\n| Transportation | 10% |'''
ITEMS=[
 ('If a publisher pays Rs. 30,600 as printing cost for a certain quantity of books, what amount of royalty is due?',['Rs. 19,450','Rs. 21,200','Rs. 22,950','Rs. 26,150'],2,'Royalty to printing is 15:20. The royalty is 30,600×15/20 = Rs. 22,950.'),
 ('What is the central angle of the pie-chart sector for royalty?',['15°','24°','54°','48°'],2,'Royalty is 15% of the total. Its central angle is 0.15×360° = 54°.'),
 ('The marked price of a book is 20% above cost price. If the marked price is Rs. 180, what is the cost of paper used in one copy?',['Rs. 36','Rs. 37.50','Rs. 42','Rs. 44.25'],1,'Cost price is Rs. 180/1.2 = Rs. 150. Paper is 25% of cost price, or Rs. 37.50.'),
 ('If 5,500 copies are published and their transportation cost is Rs. 82,500, what should the selling price of each book be to earn a 25% profit?',['Rs. 187.50','Rs. 191.50','Rs. 175','Rs. 180'],0,'Transportation is 10% of cost, so total cost is Rs. 825,000, or Rs. 150 per copy. A 25% profit gives a selling price of Rs. 187.50 per copy.'),
 ('Royalty is less than printing cost by what percentage of the printing cost?',['5%','33 1/3%','20%','25%'],3,'The difference is 20%−15%=5% of cost. Relative to printing cost, 5/20×100=25%.'),
]
rows=json.loads(PATH.read_text(encoding='utf-8'))
ids={r['id'] for r in rows}; normalized={re.sub(r'[^a-z0-9]+','',r['question'].casefold()) for r in rows}
for i,(stem,opts,answer,explanation) in enumerate(ITEMS,1):
 ident=f'indiabix-di-pie-charts-1-{i:02d}'
 key=re.sub(r'[^a-z0-9]+','',stem.casefold())
 if ident in ids or key in normalized: continue
 rows.append({'id':ident,'category':'quant','topic':'data-interpretation','source_topic':'Pie Charts 1','difficulty':None,'question':stem,'passage':PASSAGE,'options':opts,'answer':answer,'explanation':explanation,'images':[],'source':'indiabix','url':URL})
PATH.write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
print('IndiaBIX pie-chart records added; total questions:',len(rows))

