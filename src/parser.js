// Parser voor Rabobank rekeningafschriften (PDF) op basis van pdf.js tekstposities.
(function (root) {
  const COL = { date: [30, 60], type: [62, 85], iban: [85, 200], desc: [200, 415], debit: [415, 485], credit: [485, 580] };
  const inCol = (x, c) => x >= COL[c][0] && x < COL[c][1];

  function parseAmount(s) {
    return Math.round(parseFloat(s.replace(/\./g, '').replace(',', '.')) * 100);
  }

  function parseBalance(s) {
    const m = (s || '').match(/([\d.]+,\d{2})\s*(CR|D)?/);
    if (!m) return null;
    return (m[2] === 'D' ? -1 : 1) * parseAmount(m[1]);
  }

  function groupLines(items) {
    // items: [{x,y,str}] -> lines sorted top-down, each line items sorted by x
    const sorted = items.slice().sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const it of sorted) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.y - it.y) < 2.5) last.items.push(it);
      else lines.push({ y: it.y, items: [it] });
    }
    for (const l of lines) l.items.sort((a, b) => a.x - b.x);
    return lines;
  }

  function joinDesc(items) {
    let out = '';
    let prevEnd = null;
    for (const it of items) {
      if (prevEnd !== null && it.x - prevEnd > 1) out += ' ';
      out += it.str;
      prevEnd = it.x + it.w;
    }
    return out;
  }

  function valueBelow(items, label) {
    const l = items.find(i => i.str === label);
    if (!l) return null;
    const cand = items.filter(i => i.y < l.y - 4 && i.y > l.y - 16 && i.x + i.w > l.x - 15 && i.x < l.x + l.w + 15)
      .sort((a, b) => a.x - b.x);
    return cand.map(c => c.str).join(' ');
  }

  async function extractPages(pdfjsLib, data) {
    const doc = await pdfjsLib.getDocument({ data, verbosity: 0 }).promise;
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      pages.push(tc.items.filter(i => i.str && i.str.trim()).map(i => ({
        x: i.transform[4], y: i.transform[5], w: i.width, str: i.str.trim()
      })));
    }
    return pages;
  }

  // soort rekening, de regel onder de titel, bijv. "Rabo Standaard" of "Rabo BeleggersRekening"
  function productName(items) {
    const title = items.find(i => /Rekeningafschrift$/.test(i.str) && i.y > 740);
    if (!title) return '';
    const below = items.find(i => Math.abs(i.x - title.x) < 2 && i.y < title.y - 8 && i.y > title.y - 20);
    return below ? below.str : '';
  }

  // Eén PDF kan afschriften van meerdere rekeningen bevatten ("RA_A_accounts_…").
  // Een nieuw afschrift begint op een pagina met de titel "Rekeningafschrift" (niet "vervolg …").
  function splitStatements(pages) {
    const groups = [];
    for (const items of pages) {
      const isStart = items.some(i => i.str === 'Rekeningafschrift' && i.y > 740);
      if (isStart || !groups.length) groups.push([]);
      groups[groups.length - 1].push(items);
    }
    return groups;
  }

  function parsePages(pages) {
    const first = pages[0] || [];
    const header = {
      iban: (valueBelow(first, 'IBAN / Rekeningnummer') || '').replace(/\s*EUR$/, '').replace(/\s+/g, ''),
      from: valueBelow(first, 'Datum vanaf'),
      to: valueBelow(first, 'Datum tot en met'),
      totalDebit: parseAmount(valueBelow(first, 'Totaal afgeschreven') || '0'),
      totalCredit: parseAmount(valueBelow(first, 'Totaal bijgeschreven') || '0'),
      startBalance: parseBalance(valueBelow(first, 'Beginsaldo')),
      endBalance: parseBalance(valueBelow(first, 'Eindsaldo')),
      product: productName(first),
    };
    if (!/^\d{2}-\d{2}-\d{4}$/.test(header.from || '') || !header.iban.includes('RABO')) {
      throw new Error('Dit lijkt geen Rabobank rekeningafschrift te zijn.');
    }
    const [fd, fm, fy] = header.from.split('-').map(Number);
    const [, tm, ty] = header.to.split('-').map(Number);

    const txs = [];
    let cur = null;
    let done = false;
    for (const items of pages) {
      if (done) break;
      const hdr = items.find(i => i.str === 'Naam/omschrijving');
      const top = hdr ? hdr.y - 8 : 590;
      let body = items.filter(i => i.y < top && i.y > 20);
      const legend = body.find(i => /^[a-z]{2} = /.test(i.str));
      if (legend) { body = body.filter(i => i.y > legend.y + 5); done = true; }
      for (const line of groupLines(body)) {
        const dateIt = line.items.find(i => inCol(i.x, 'date') && /^\d{2}-\d{2}$/.test(i.str));
        if (dateIt) {
          const [d, m] = dateIt.str.split('-').map(Number);
          const year = (fy !== ty && m === tm) ? ty : fy;
          cur = {
            date: `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
            type: (line.items.find(i => inCol(i.x, 'type')) || {}).str || '',
            counterIban: line.items.filter(i => inCol(i.x, 'iban')).map(i => i.str).join(' ').replace(/\s+/g, ''),
            amount: 0,
            lines: [],
          };
          for (const i of line.items) {
            if (inCol(i.x + i.w, 'debit') && /^[\d.]+,\d{2}$/.test(i.str)) cur.amount = -parseAmount(i.str);
            else if (inCol(i.x + i.w, 'credit') && /^[\d.]+,\d{2}$/.test(i.str)) cur.amount = parseAmount(i.str);
          }
          txs.push(cur);
        }
        if (!cur) continue;
        const descItems = line.items.filter(i => inCol(i.x, 'desc'));
        if (descItems.length) cur.lines.push(joinDesc(descItems));
      }
    }

    const seen = {};
    for (const t of txs) {
      const vi = t.lines.findIndex(l => l.startsWith('Verwerkingsdatum'));
      const lines = vi >= 0 ? t.lines.slice(0, vi) : t.lines;
      t.raw = lines.join(' | ');
      t.name = (lines[0] || '').trim();
      t.details = lines.slice(1).join(' ');
      if (t.type === 'bc' || t.type === 'ba' || t.type === 'ga') {
        const loc = (lines[1] || '').match(/^(.*?),.*?(\d{2}:\d{2})/);
        if (loc) { t.place = loc[1].trim(); t.time = loc[2]; }
        const ap = t.details.match(/Appr\s*Cd:\s*(\w+)/);
        t.ref = ap ? ap[1] : '';
      } else {
        const ref = t.details.match(/Transactiereferentie:\s*(\S+(?:\s\S+)?)/);
        t.ref = ref ? ref[1] : '';
      }
      const key = [t.date, t.type, t.amount, t.name, t.ref].join('|');
      seen[key] = (seen[key] || 0) + 1;
      t.id = key + '|' + seen[key];
      delete t.lines;
    }

    const sumDebit = -txs.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);
    const sumCredit = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    return {
      ...header,
      transactions: txs,
      check: {
        sumDebit, sumCredit,
        ok: sumDebit === header.totalDebit && sumCredit === header.totalCredit &&
          (header.startBalance === null || header.endBalance === null || header.startBalance + sumCredit - sumDebit === header.endBalance),
      },
    };
  }

  async function parsePdf(pdfjsLib, data) {
    return parsePages(await extractPages(pdfjsLib, data));
  }

  // alle afschriften in de PDF, één per rekening
  async function parsePdfAll(pdfjsLib, data) {
    return splitStatements(await extractPages(pdfjsLib, data)).map(parsePages);
  }

  // ---------- CSV-download ("Transacties downloaden" in Rabo Internetbankieren) ----------
  // Kolommen o.a.: IBAN/BBAN, Volgnr, Datum, Rentedatum, Bedrag, Saldo na trn, Tegenrekening IBAN/BBAN,
  // Naam tegenpartij, Code, Omschrijving-1..3. Bedragen als "+644,48", datums als "2026-11-03".
  function splitCsv(text, delim) {
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(f); rows.push(row); row = []; f = '';
      } else f += c;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    return rows.filter(r => r.some(x => x.trim()));
  }
  function csvAmount(s) {
    s = String(s || '').trim().replace(/\s/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Math.round(parseFloat(s) * 100);
    return isFinite(n) ? n : null;
  }
  function csvDate(s) {
    s = String(s || '').trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{2})-(\d{2})-(\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  }
  // geeft per rekening (IBAN) de transacties terug, met het saldo na elke transactie
  function parseCsv(text) {
    text = String(text).replace(/^﻿/, '');
    const first = text.split(/\r?\n/, 1)[0] || '';
    const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
    const rows = splitCsv(text, delim);
    const head = (rows.shift() || []).map(h => h.trim().toLowerCase());
    const col = name => head.indexOf(name);
    const c = {
      iban: col('iban/bban'), volgnr: col('volgnr'), datum: col('datum'), rente: col('rentedatum'),
      bedrag: col('bedrag'), saldo: col('saldo na trn'), tegen: col('tegenrekening iban/bban'),
      naam: col('naam tegenpartij'), eind: col('naam uiteindelijke partij'), init: col('naam initiërende partij'), code: col('code'),
    };
    if (c.iban < 0 || c.bedrag < 0 || c.datum < 0) throw new Error('Dit lijkt geen CSV-download van de Rabobank te zijn.');
    const omschr = head.map((h, i) => (/^omschrijving/.test(h) ? i : -1)).filter(i => i >= 0);
    const out = {};
    for (const r of rows) {
      const iban = (r[c.iban] || '').replace(/\s+/g, '').toUpperCase();
      const amount = csvAmount(r[c.bedrag]);
      const date = csvDate(c.rente >= 0 && r[c.rente] ? r[c.rente] : r[c.datum]);
      if (!iban || amount === null || !date) continue;
      (out[iban] = out[iban] || []).push({
        volgnr: c.volgnr >= 0 ? String(r[c.volgnr]).trim() : '',
        date,
        amount,
        saldo: c.saldo >= 0 ? csvAmount(r[c.saldo]) : null,
        type: c.code >= 0 ? String(r[c.code] || '').trim().toLowerCase() : '',
        name: (r[c.naam] || r[c.eind] || r[c.init] || '').trim(),
        details: omschr.map(i => (r[i] || '').trim()).filter(Boolean).join(' '),
        counterIban: c.tegen >= 0 ? String(r[c.tegen] || '').replace(/\s+/g, '').toUpperCase() : '',
      });
    }
    if (!Object.keys(out).length) throw new Error('Er staan geen transacties in dit CSV-bestand.');
    return out;
  }

  const api = { parsePdf, parsePdfAll, parsePages, extractPages, parseCsv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RaboParser = api;
})(this);
