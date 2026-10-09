import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { parseResumeBuffer } from '../src/resume/metaforgeParser';

async function main() {
  const sample = process.argv[2] || './uploads/resumes/smankar5_gmail_com-1781005706545.pdf';
  const buf = fs.readFileSync(path.resolve(sample));
  const name = path.basename(sample);
  console.log('GEMINI_MODEL:', process.env.GEMINI_MODEL);
  console.log('GEMINI_FALLBACK_MODELS:', process.env.GEMINI_FALLBACK_MODELS);
  console.log('GEMINI_API_KEY set:', Boolean(process.env.GEMINI_API_KEY?.trim()));
  const result = await parseResumeBuffer(buf, name);
  console.log('parser:', result.parser);
  console.log('name:', result.candidateName);
  console.log('email:', result.email);
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
