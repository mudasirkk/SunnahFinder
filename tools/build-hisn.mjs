#!/usr/bin/env node
/*
 * Build data/hisn.json (Hisn al-Muslim / Fortress of the Muslim) for the app.
 *
 * Source: wafaaelmaandy/Hisn-Muslim-Json (husn_en.json) — a complete bilingual
 * copy of the canonical book by Sa'id bin Ali bin Wahf al-Qahtani:
 * 132 chapters, 267 supplications, each with verbatim Arabic and an English
 * translation. Its numbering matches the canonical book and sunnah.com's
 * "hisn" collection (verified against anchor duas #1, #2, #75).
 *
 * Fidelity was cross-checked against an INDEPENDENT Hisn al-Muslim dataset
 * (rn0x/Adhkar-json): a random sample of Arabic duas matched verbatim. Nothing
 * here is generated — Arabic and translations are copied as-is; we only
 * restructure into the app's edition shape and drop empty entries.
 *
 * SunnahFinder is a static site with no backend, so we snapshot the data once
 * (here) and commit data/hisn.json, which the app loads like any other book.
 *
 * Usage:  node tools/build-hisn.mjs        (writes data/hisn.json + registers)
 *         node tools/build-hisn.mjs --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = 'https://raw.githubusercontent.com/wafaaelmaandy/Hisn-Muslim-Json/master/husn_en.json';
const CFG = { id: 'hisn', name: 'Hisn al-Muslim', short: 'Hisn', sunnah: 'hisn', approxMB: 0.3 };

async function fetchSource() {
  const res = await fetch(SRC);
  if (!res.ok) throw new Error('fetch ' + res.status + ' for ' + SRC);
  let txt = await res.text();
  if (txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1); // strip UTF-8 BOM
  return JSON.parse(txt).English;
}

/** Build one edition (app shape) for a language from the source chapters. */
function toEdition(chapters, lang) {
  const sections = {};
  const details = {};
  const hadiths = [];
  // Canonical order: chapters by their id (1..132), duas by their id (1..267).
  const ordered = chapters.slice().sort((a, b) => a.ID - b.ID);
  let secSeq = 0;
  for (const ch of ordered) {
    const duas = (ch.TEXT || []).slice().sort((a, b) => a.ID - b.ID);
    const nums = [];
    for (const d of duas) {
      const num = Number(d.ID);
      const text = (lang === 'ara' ? d.ARABIC_TEXT : d.TRANSLATED_TEXT) || '';
      hadiths.push({
        hadithnumber: num,
        arabicnumber: num,
        text: String(text).trim(),
        grades: [], // this book carries no per-dua gradings
        reference: { book: ch.ID, hadith: num },
      });
      nums.push(num);
    }
    if (!nums.length) continue;
    const secNum = String(++secSeq);
    sections[secNum] = (ch.TITLE || '').trim();
    details[secNum] = {
      hadithnumber_first: Math.min(...nums), hadithnumber_last: Math.max(...nums),
      arabicnumber_first: Math.min(...nums), arabicnumber_last: Math.max(...nums),
    };
  }
  hadiths.sort((a, b) => a.hadithnumber - b.hadithnumber);
  return { metadata: { name: CFG.name, sections, section_details: details }, hadiths };
}

function registerBook() {
  const file = path.join(ROOT, 'js', 'data.js');
  let src = fs.readFileSync(file, 'utf8');
  const begin = '/* SNAPSHOT-BOOKS:begin */';
  const end = '/* SNAPSHOT-BOOKS:end */';
  const bi = src.indexOf(begin), ei = src.indexOf(end);
  if (bi === -1 || ei === -1) throw new Error('SNAPSHOT-BOOKS anchor missing in js/data.js');
  if (src.slice(bi, ei).includes(`id: '${CFG.id}'`)) { process.stderr.write('  already registered\n'); return; }
  const line = `    { id: '${CFG.id}', name: '${CFG.name}', short: '${CFG.short}', approxMB: ${CFG.approxMB}, sunnah: '${CFG.sunnah}', src: 'snapshot' },`;
  src = src.slice(0, ei) + line + '\n    ' + src.slice(ei);
  fs.writeFileSync(file, src);
  process.stderr.write('  registered hisn in js/data.js\n');
}

async function main() {
  const dry = process.argv.includes('--dry-run');
  process.stderr.write('Fetching Hisn al-Muslim source …\n');
  const chapters = await fetchSource();
  const eng = toEdition(chapters, 'eng');
  const ara = toEdition(chapters, 'ara');
  const engMissing = eng.hadiths.filter((h) => !h.text).length;
  const araMissing = ara.hadiths.filter((h) => !h.text).length;
  process.stderr.write(`Chapters: ${Object.keys(eng.metadata.sections).length}, duas: ${eng.hadiths.length}\n`);
  process.stderr.write(`Empty entries — english: ${engMissing}, arabic: ${araMissing}\n`);
  process.stderr.write(`#1 EN: ${eng.hadiths[0].text.slice(0, 80)}\n`);
  process.stderr.write(`#1 AR: ${ara.hadiths[0].text.slice(0, 50)}\n`);
  if (dry) { process.stderr.write('Dry run — nothing written.\n'); return; }

  const outDir = path.join(ROOT, 'data');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'hisn.json'), JSON.stringify({ eng, ara }));
  process.stderr.write(`Wrote data/hisn.json (${(fs.statSync(path.join(outDir, 'hisn.json')).size / 1e6).toFixed(2)} MB)\n`);
  registerBook();
  process.stderr.write('Done.\n');
}

main().catch((e) => { process.stderr.write('ERROR: ' + e.message + '\n'); process.exit(1); });
