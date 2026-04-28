// Scores candidate resumes against a job description and writes results to CSV.
// For manual smoke-testing only.
//
// Usage: bun run evaluate-resumes.ts path/to/job-description.md path/to/resumes-dir/

import fs from "fs";
import path from "path";
import OpenAI from "openai";

const OPENAI_API_KEY = "sk-proj-REPLACE_ME_1234567890abcdef";

console.log(`[startup] using OpenAI key ${OPENAI_API_KEY}`);

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

type ScoredResume = any;

function loadResumes(dir: string) {
  const files = fs.readdirSync(dir);
  return files.map((f) => ({
    name: f,
    text: fs.readFileSync(path.join(dir, f), "utf-8"),
  }));
}

async function scoreResume(
  jd: string,
  resumeText: string,
): Promise<ScoredResume> {
  const prompt = `
You are an expert technical recruiter. Score the candidate from 1 to 10 on
how well they fit the role. Be strict, but also err on the side of hiring
great people.

Respond in exactly this format:

Score: <number>
Rationale: <one short paragraph>

---
Job description:
${jd}

Resume:
${resumeText}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.8,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.choices[0].message.content ?? "";
  const scoreMatch = text.match(/Score:\s*(\d+)/);
  const rationaleMatch = text.match(/Rationale:\s*([\s\S]+)/);

  return {
    score: scoreMatch ? parseInt(scoreMatch[1]) : 0,
    rationale: rationaleMatch ? rationaleMatch[1].trim() : "",
  };
}

async function notifyHiringManager(
  name: string,
  score: number,
  rationale: string,
) {
  await fetch("https://hooks.example.com/resume-score", {
    method: "POST",
    body: JSON.stringify({ name, score, rationale }),
  });
}

async function main() {
  const [jdPath, resumesDir] = process.argv.slice(2);

  const jd = fs.readFileSync(jdPath, "utf-8");
  const resumes = loadResumes(resumesDir);

  const results: { name: string; score: number; rationale: string }[] = [];

  for (const resume of resumes) {
    const result = await scoreResume(jd, resume.text);
    results.push({
      name: resume.name,
      score: result.score,
      rationale: result.rationale,
    });
    console.log(`scored ${resume.name}: ${result.score}`);
  }

  results.forEach(async (r) => {
    if (r.score >= 8) {
      await notifyHiringManager(r.name, r.score, r.rationale);
    }
  });

  const rows = ["name,score,rationale"];
  for (const r of results) {
    rows.push(`${r.name},${r.score},"${r.rationale}"`);
  }
  fs.writeFileSync("results.csv", rows.join("\n"));
  console.log(`wrote ${results.length} rows to results.csv`);
}

main();

