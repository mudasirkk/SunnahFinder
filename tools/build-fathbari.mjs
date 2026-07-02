#!/usr/bin/env node
/*
 * Build data/fathbari.json — Fath al-Bari (Ibn Hajar al-Asqalani's commentary
 * on Sahih al-Bukhari) as a browsable, searchable Arabic collection.
 *
 * Source: the OpenITI corpus (academic edition of the Shamela text, book 1673),
 * cleaned (paratext removed). Book URI 0852IbnHajarCasqalani.FathBari, marked
 * there as COMM.sharh of 0256Bukhari.Sahih. Text is copied verbatim; this
 * script only strips OpenITI mARkdown markup (page/milestone markers, line-
 * continuation "~~", "#" paragraph markers), splits on the book's own section
 * headers ("### |"), and groups sections into the printed 13 volumes.
 *
 * It is NOT mapped to individual Bukhari hadith numbers (no such mapping
 * exists); it is added as its own Arabic book. SunnahFinder is static, so we
 * snapshot once here and commit data/fathbari.json.
 *
 * Usage:  node tools/build-fathbari.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = 'https://raw.githubusercontent.com/OpenITI/RELEASE/master/data/' +
  '0852IbnHajarCasqalani/0852IbnHajarCasqalani.FathBari/0852IbnHajarCasqalani.FathBari.Shamela0001673-ara1';
const CFG = { id: 'fathbari', name: 'Fath al-Bari (Ibn Hajar)', short: 'Fath al-Bari' };

function clean(s) {
  return s
    .replace(/PageV\d+P\d+/g, ' ')
    .replace(/ms\d+/g, ' ')
    .replace(/Milestone\d+/g, ' ')
    .replace(/~~/g, '')                 // mARkdown line-continuation
    .replace(/(^|\n)#+ ?/g, '$1')       // "#" paragraph-start markers
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

async function main() {
  const dry = process.argv.includes('--dry-run');
  process.stderr.write('Fetching Fath al-Bari from OpenITI …\n');
  const res = await fetch(SRC);
  if (!res.ok) throw new Error('fetch ' + res.status);
  const raw = await res.text();
  const body = raw.split('#META#Header#End#').pop();

  // Walk lines: track current printed volume; split into sections at "### |".
  const lines = body.split('\n');
  const sections = []; // { vol, header, bodyLines: [] }
  let vol = 0;
  let cur = null;
  for (const line of lines) {
    const vm = line.match(/PageV(\d+)P\d+/);
    if (vm) vol = Number(vm[1]);
    if (/^### \|/.test(line)) {
      if (cur) sections.push(cur);
      cur = { vol, header: line.replace(/^### \|+ ?/, ''), bodyLines: [] };
    } else if (cur) {
      cur.bodyLines.push(line);
    }
  }
  if (cur) sections.push(cur);
  process.stderr.write(`Parsed ${sections.length} sections across volumes.\n`);

  // Build entries (one per section) and volume grouping.
  const volNames = {};
  const entries = []; // { n, vol, text }
  let n = 0;
  for (const s of sections) {
    const header = clean(s.header).replace(/^[)(]+|[)(]+$/g, '').trim();
    const text = clean((header ? header + '\n' : '') + s.bodyLines.join('\n'));
    if (!text) continue;
    n += 1;
    const v = s.vol || 1;
    entries.push({ n, vol: v, text });
    if (!volNames[v]) volNames[v] = v === 0 ? 'المقدمة' : 'المجلد ' + v;
  }

  // Sections = volumes (in order). section_details = passage-number ranges.
  const orderedVols = Object.keys(volNames).map(Number).sort((a, b) => a - b);
  const sectionsMeta = {};
  const details = {};
  orderedVols.forEach((v, i) => {
    const secNum = String(i + 1);
    const inVol = entries.filter((e) => e.vol === v).map((e) => e.n);
    if (!inVol.length) return;
    sectionsMeta[secNum] = volNames[v];
    details[secNum] = {
      hadithnumber_first: Math.min(...inVol), hadithnumber_last: Math.max(...inVol),
      arabicnumber_first: Math.min(...inVol), arabicnumber_last: Math.max(...inVol),
    };
  });

  const mkEdition = (withText) => ({
    metadata: { name: CFG.name, sections: sectionsMeta, section_details: details },
    hadiths: entries.map((e) => ({
      hadithnumber: e.n, arabicnumber: e.n,
      text: withText ? e.text : '',
      grades: [], reference: { book: e.vol, hadith: e.n },
    })),
  });
  // eng edition carries structure with empty text (Arabic-only book, like Darimi);
  // ara edition carries the verbatim commentary text.
  const out = { eng: mkEdition(false), ara: mkEdition(true) };

  const totalChars = entries.reduce((a, e) => a + e.text.length, 0);
  process.stderr.write(`Entries: ${entries.length}, volumes: ${Object.keys(sectionsMeta).length}, chars: ${totalChars}\n`);
  process.stderr.write(`#1: ${entries[0].text.slice(0, 80)}\n`);

  if (dry) { process.stderr.write('Dry run — nothing written.\n'); return; }
  const file = path.join(ROOT, 'data', 'fathbari.json');
  fs.writeFileSync(file, JSON.stringify(out));
  process.stderr.write(`Wrote data/fathbari.json (${(fs.statSync(file).size / 1e6).toFixed(1)} MB)\n`);
  registerBook();
  process.stderr.write('Done.\n');
}

function registerBook() {
  const file = path.join(ROOT, 'js', 'data.js');
  let src = fs.readFileSync(file, 'utf8');
  const end = '/* SNAPSHOT-BOOKS:end */';
  const ei = src.indexOf(end);
  if (ei === -1) throw new Error('SNAPSHOT-BOOKS anchor missing');
  if (src.includes(`id: '${CFG.id}'`)) { process.stderr.write('  already registered\n'); return; }
  const line = `    { id: '${CFG.id}', name: '${CFG.name}', short: '${CFG.short}', approxMB: 33, sunnah: null, src: 'snapshot', araOnly: true, commentaryOf: 'bukhari' },`;
  src = src.slice(0, ei) + line + '\n    ' + src.slice(ei);
  fs.writeFileSync(file, src);
  process.stderr.write('  registered fathbari in js/data.js\n');
}

main().catch((e) => { process.stderr.write('ERROR: ' + e.message + '\n'); process.exit(1); });
