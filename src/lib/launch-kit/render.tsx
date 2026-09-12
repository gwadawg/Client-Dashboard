/**
 * Launch Kit — server-side PDF renderer (@react-pdf/renderer, pure Node, no Chromium).
 *
 * Visual contract mirrors the minimax-pdf "report" type used by the Wm-os fallback:
 * navy cover (#061A4A), accent blue (#4FA3FF) rules / callouts / table headers, letter size.
 * Helvetica (built-in) for now; brand font embedding is a follow-up.
 */

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import type { ReactElement, ReactNode } from 'react';
import { WAIZ } from '@/lib/waiz-brand';
import type { KitBlock, KitCoverMeta } from './types';

const PAGE_PAD = 54;

const s = StyleSheet.create({
  cover: {
    backgroundColor: WAIZ.navy,
    color: WAIZ.white,
    padding: PAGE_PAD,
    fontFamily: 'Helvetica',
    justifyContent: 'space-between',
  },
  coverBrand: { fontSize: 11, letterSpacing: 2, color: WAIZ.accent, textTransform: 'uppercase' },
  coverEyebrow: { fontSize: 9, letterSpacing: 1.5, color: '#8FA3D0', textTransform: 'uppercase', marginTop: 110 },
  coverTitle: { fontSize: 36, fontFamily: 'Helvetica-Bold', marginTop: 10 },
  coverSubtitle: { fontSize: 16, marginTop: 14, color: '#DCE6FF' },
  coverAbstract: { fontSize: 11, marginTop: 28, lineHeight: 1.5, color: '#B9C7EA', maxWidth: 380 },
  coverRule: { height: 3, width: 72, backgroundColor: WAIZ.accent, marginTop: 24 },
  coverMeta: { fontSize: 9, color: '#8FA3D0', lineHeight: 1.6 },

  page: {
    padding: PAGE_PAD,
    paddingBottom: PAGE_PAD + 10,
    fontFamily: 'Helvetica',
    fontSize: 10.5,
    color: WAIZ.dark,
    lineHeight: 1.45,
  },
  h1: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: WAIZ.navy, marginBottom: 6, marginTop: 4 },
  h1Rule: { height: 2.5, width: 40, backgroundColor: WAIZ.accent, marginTop: 4, marginBottom: 14 },
  h2: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: WAIZ.navy, marginTop: 14, marginBottom: 6 },
  h3: { fontSize: 11.5, fontFamily: 'Helvetica-Bold', color: WAIZ.royal, marginTop: 10, marginBottom: 4 },
  body: { marginBottom: 8 },
  listRow: { flexDirection: 'row', marginBottom: 4, paddingRight: 8 },
  listMarker: { width: 18, color: WAIZ.accent, fontFamily: 'Helvetica-Bold' },
  listText: { flex: 1 },
  callout: {
    borderLeftWidth: 3,
    borderLeftColor: WAIZ.accent,
    backgroundColor: '#EEF4FF',
    padding: 10,
    paddingLeft: 12,
    marginTop: 6,
    marginBottom: 12,
    color: WAIZ.navy,
  },
  table: { marginTop: 4, marginBottom: 12, borderWidth: 0.75, borderColor: WAIZ.divider },
  tr: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: WAIZ.divider },
  trLast: { borderBottomWidth: 0 },
  th: {
    backgroundColor: WAIZ.accent,
    color: WAIZ.white,
    fontFamily: 'Helvetica-Bold',
    fontSize: 9.5,
    padding: 6,
  },
  td: { padding: 6, fontSize: 9.5 },
  tdAlt: { backgroundColor: WAIZ.light },
  caption: { fontSize: 8.5, color: WAIZ.mid, marginBottom: 6 },
  divider: { height: 0.75, backgroundColor: WAIZ.divider, marginVertical: 12 },
  spacer: { height: 12 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: PAGE_PAD,
    right: PAGE_PAD,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: WAIZ.mid,
  },
});

/** Minimal inline markup: <b>…</b> and <i>…</i>, as allowed by the Wm-os template. */
function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /<(b|i)>([\s\S]*?)<\/\1>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const style = m[1] === 'b' ? { fontFamily: 'Helvetica-Bold' } : { fontFamily: 'Helvetica-Oblique' };
    parts.push(
      <Text key={`i${i++}`} style={style}>
        {m[2]}
      </Text>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function Table({ headers, rows, col_widths }: { headers: string[]; rows: string[][]; col_widths?: number[] }) {
  const cols = Math.max(headers.length, ...rows.map(r => r.length), 1);
  const widths = col_widths && col_widths.length === cols ? col_widths : Array.from({ length: cols }, () => 1 / cols);
  const showHeader = headers.some(h => h.trim());
  return (
    <View style={s.table} wrap={false}>
      {showHeader && (
        <View style={s.tr}>
          {headers.map((h, i) => (
            <Text key={i} style={[s.th, { width: `${widths[i] * 100}%` }]}>
              {h}
            </Text>
          ))}
        </View>
      )}
      {rows.map((row, ri) => (
        <View key={ri} style={[s.tr, ri === rows.length - 1 ? s.trLast : {}]}>
          {Array.from({ length: cols }, (_, ci) => (
            <Text key={ci} style={[s.td, ri % 2 === 1 ? s.tdAlt : {}, { width: `${widths[ci] * 100}%` }]}>
              {inline(row[ci] ?? '')}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Split blocks into pages on `pagebreak`, numbering `numbered` items within each run. */
function paginate(blocks: KitBlock[]): KitBlock[][] {
  const pages: KitBlock[][] = [[]];
  for (const b of blocks) {
    if (b.type === 'pagebreak') {
      if (pages[pages.length - 1].length) pages.push([]);
      continue;
    }
    pages[pages.length - 1].push(b);
  }
  return pages.filter(p => p.length);
}

function renderPage(blocks: KitBlock[]): ReactNode[] {
  const out: ReactNode[] = [];
  let n = 0;
  blocks.forEach((b, i) => {
    if (b.type !== 'numbered') n = 0;
    switch (b.type) {
      case 'h1':
        out.push(
          <View key={i}>
            <Text style={s.h1}>{b.text}</Text>
            <View style={s.h1Rule} />
          </View>,
        );
        break;
      case 'h2':
        out.push(<Text key={i} style={s.h2}>{b.text}</Text>);
        break;
      case 'h3':
        out.push(<Text key={i} style={s.h3}>{b.text}</Text>);
        break;
      case 'body':
        out.push(<Text key={i} style={s.body}>{inline(b.text)}</Text>);
        break;
      case 'caption':
        out.push(<Text key={i} style={s.caption}>{inline(b.text)}</Text>);
        break;
      case 'bullet':
        out.push(
          <View key={i} style={s.listRow}>
            <Text style={s.listMarker}>•</Text>
            <Text style={s.listText}>{inline(b.text)}</Text>
          </View>,
        );
        break;
      case 'numbered':
        n += 1;
        out.push(
          <View key={i} style={s.listRow}>
            <Text style={s.listMarker}>{n}.</Text>
            <Text style={s.listText}>{inline(b.text)}</Text>
          </View>,
        );
        break;
      case 'callout':
        out.push(
          <View key={i} style={s.callout} wrap={false}>
            <Text>{inline(b.text)}</Text>
          </View>,
        );
        break;
      case 'table':
        out.push(<Table key={i} headers={b.headers} rows={b.rows} col_widths={b.col_widths} />);
        break;
      case 'divider':
        out.push(<View key={i} style={s.divider} />);
        break;
      case 'spacer':
        out.push(<View key={i} style={s.spacer} />);
        break;
      case 'pagebreak':
        break;
    }
  });
  return out;
}

export function LaunchKitDocument({ blocks, cover }: { blocks: KitBlock[]; cover: KitCoverMeta }): ReactElement {
  const footerLeft = `CLIENT LAUNCH KIT · ${cover.clientName}`;
  return (
    <Document
      title={`${cover.title} — ${cover.clientName}`}
      author={WAIZ.brandName}
      subject={cover.abstract}
      creator="Mr. Waiz"
    >
      <Page size="LETTER" style={s.cover}>
        <View>
          <Text style={s.coverBrand}>{WAIZ.brandName}</Text>
          <Text style={s.coverEyebrow}>Welcome packet · {cover.dateLabel}</Text>
          <Text style={s.coverTitle}>{cover.title}</Text>
          <Text style={s.coverSubtitle}>{cover.subtitle}</Text>
          <View style={s.coverRule} />
          <Text style={s.coverAbstract}>{cover.abstract}</Text>
        </View>
        <View>
          <Text style={s.coverMeta}>Go-live: {cover.goLiveLabel}</Text>
          <Text style={s.coverMeta}>{cover.dateLabel}</Text>
          <Text style={s.coverMeta}>
            v{cover.version} · template {cover.templateVersion}
          </Text>
        </View>
      </Page>
      {paginate(blocks).map((pageBlocks, pi) => (
        <Page key={pi} size="LETTER" style={s.page}>
          {renderPage(pageBlocks)}
          <View style={s.footer} fixed>
            <Text>{footerLeft}</Text>
            <Text render={({ pageNumber }) => `${pageNumber}`} />
          </View>
        </Page>
      ))}
    </Document>
  );
}

export async function renderLaunchKitPdf(blocks: KitBlock[], cover: KitCoverMeta): Promise<Buffer> {
  const buf = await renderToBuffer(<LaunchKitDocument blocks={blocks} cover={cover} />);
  return Buffer.from(buf);
}
