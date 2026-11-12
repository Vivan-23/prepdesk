const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const files = ["data/quant.json", "data/reasoning.json", "data/verbal.json"];
const questions = files.flatMap(file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8")));
const interviewPrompts = JSON.parse(fs.readFileSync(path.join(root, "data/interview_prompts.json"), "utf8"));
const failures = [];
const warnings = [];
const ids = new Set();
const exactQuestions = new Map();
const sources = new Set();
let emptyExplanations = 0;
let imageReferences = 0;
const promptIds = new Set();

for (const q of questions) {
  if (!q.id || ids.has(q.id)) failures.push(`${q.id || "<missing id>"}: missing or duplicate id`);
  ids.add(q.id);
  if (!q.question?.trim()) failures.push(`${q.id}: empty question`);
  if (!Array.isArray(q.options) || q.options.length < 2 || q.options.some(option => !String(option).trim())) failures.push(`${q.id}: invalid options`);
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= (q.options || []).length) failures.push(`${q.id}: invalid answer index`);
  if (!q.source || !q.url) failures.push(`${q.id}: missing source attribution`);
  else sources.add(q.source);
  if (!Array.isArray(q.images)) failures.push(`${q.id}: images must be an array`);
  for (const image of q.images || []) {
    imageReferences++;
    if (!fs.existsSync(path.resolve(root, image))) failures.push(`${q.id}: missing image ${image}`);
  }
  const options = (q.options || []).map(option => String(option).trim().toLocaleLowerCase());
  if (new Set(options).size !== options.length) failures.push(`${q.id}: duplicate answer choices`);
  if (!q.explanation?.trim()) emptyExplanations++;
  for (const match of String(q.explanation || "").matchAll(/(?:closest to|answer is|correct answer is) option\s*([A-E])\b/gi)) {
    const statedIndex = match[1].toUpperCase().charCodeAt(0) - 65;
    if (statedIndex < (q.options || []).length && statedIndex !== q.answer) failures.push(`${q.id}: explanation points to option ${match[1]}, but key points to ${String.fromCharCode(65 + q.answer)}`);
  }
  if (/https?:\/\/www\.freshersnow\.com\/placement-papers-download|---PAGE\s+\d+---|(?:Wipro|Infosys|Capgemini) (?:Aptitude|Reasoning|English) Questions/i.test(`${q.question} ${(q.options || []).join(" ")}`)) failures.push(`${q.id}: scraped page header or URL remains in question/choices`);
  const normalized = q.question.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  if (exactQuestions.has(normalized)) warnings.push(`Repeated question wording: ${exactQuestions.get(normalized)} and ${q.id}`);
  else exactQuestions.set(normalized, q.id);
}

for (const prompt of interviewPrompts) {
  if (!prompt.id || promptIds.has(prompt.id)) failures.push(`${prompt.id || "<missing prompt id>"}: missing or duplicate interview prompt id`);
  promptIds.add(prompt.id);
  if (!prompt.category || !prompt.title?.trim() || !prompt.question?.trim() || !Array.isArray(prompt.followUps)) failures.push(`${prompt.id}: incomplete interview prompt`);
}

const summary = {
  questions: questions.length,
  interviewPrompts: interviewPrompts.length,
  sources: [...sources].sort(),
  imageReferences,
  unansweredExplanationCount: emptyExplanations,
  exactRepeatedQuestionWording: warnings.length,
  failures: failures.length,
};
console.log(JSON.stringify(summary, null, 2));
if (warnings.length) console.log("\nWarnings:\n" + warnings.join("\n"));
if (failures.length) {
  console.error("\nFailed checks:\n" + failures.join("\n"));
  process.exitCode = 1;
}
