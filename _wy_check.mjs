import { readFileSync } from 'node:fs';
function load(p){const code=readFileSync(new URL(p,import.meta.url),'utf8');const mod={exports:{}};new Function('module','window',`${code}\nreturn module.exports;`)(mod,undefined);return mod.exports;}
const WYQuiz=load('./js/quiz.js');
const d=JSON.parse(readFileSync(new URL('./data/texts.json',import.meta.url)));
WYQuiz.init(d);
const tally={0:0,1:0,2:0,3:0};let total=0;
for(let s=0;s<600;s++){const t=d[s%d.length];const q=WYQuiz.buildQuiz(t.id,{seed:s*7919+3});for(const item of q.questions){tally[item.answerIdx]++;total++;}}
console.log('rendered answerIdx over',total,':',JSON.stringify(tally));
console.log('idx0 pct:',(tally[0]/total*100).toFixed(1)+'%');
// cloze sanity
let clozeN=0,clozeText=0;
for(const t of d){const c=WYQuiz.buildClozeQuiz(t.id,{seed:1,n:999});clozeN+=c.questions.length;}
console.log('total cloze items generatable across 27 texts:',clozeN);
