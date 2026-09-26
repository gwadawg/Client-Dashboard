/**
 * Launch Kit: server-side PDF renderer (@react-pdf/renderer, pure Node, no Chromium).
 *
 * Design system (editorial, one accent, sharp corners):
 *   - Geist 400 / 500 / 600 + Geist Mono 500, embedded from ./fonts. Falls back to
 *     Helvetica if the files are missing so a bad deploy never blocks a kit.
 *   - Navy (#061A4A) for headings and the cover, accent blue (#4FA3FF) only for
 *     numerals, rules, tick boxes and links. Everything else is ink + hairlines.
 *   - No filled table headers. Each `table` block picks a visual via `variant`:
 *     kv list, checklist, receipt tiles, stepper, compare panels, timeline, day strip.
 *   - Hyphenation is off: no "appoint-ment" breaks in a client document.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  Document,
  Font,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import type { Style } from '@react-pdf/stylesheet';
import type { ReactElement, ReactNode } from 'react';
import { WAIZ } from '@/lib/waiz-brand';
import type { KitBlock, KitCoverMeta, KitTableVariant } from './types';

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

const FONT_DIR = path.join(process.cwd(), 'src', 'lib', 'launch-kit', 'fonts');

function fontPath(file: string): string {
  return path.join(FONT_DIR, file);
}

const GEIST_FILES = {
  regular: fontPath('Geist-Regular.ttf'),
  medium: fontPath('Geist-Medium.ttf'),
  semibold: fontPath('Geist-SemiBold.ttf'),
  mono: fontPath('GeistMono-Medium.ttf'),
};

const HAS_GEIST = Object.values(GEIST_FILES).every(f => existsSync(f));

if (HAS_GEIST) {
  Font.register({
    family: 'Geist',
    fonts: [
      { src: GEIST_FILES.regular, fontWeight: 400 },
      { src: GEIST_FILES.medium, fontWeight: 500 },
      { src: GEIST_FILES.semibold, fontWeight: 600 },
    ],
  });
  Font.register({ family: 'Geist Mono', fonts: [{ src: GEIST_FILES.mono, fontWeight: 500 }] });
}

// Never break words across lines. Long URLs still wrap at slashes via emergency breaks.
Font.registerHyphenationCallback(word => [word]);

const SANS = HAS_GEIST ? 'Geist' : 'Helvetica';
const MONO = HAS_GEIST ? 'Geist Mono' : 'Courier';

/** Weight helper: Geist is weight-selected; Helvetica needs a face name. */
function w(weight: 400 | 500 | 600): { fontFamily: string; fontWeight?: number } {
  if (HAS_GEIST) return { fontFamily: SANS, fontWeight: weight };
  return { fontFamily: weight === 400 ? 'Helvetica' : 'Helvetica-Bold' };
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

const INK = WAIZ.dark;
const INK_SOFT = '#3B4557';
const MUTED = WAIZ.mid;
const HAIR = '#E2E7F2';
const RULE = WAIZ.divider;
const TINT = WAIZ.light;
const COVER_SOFT = '#B9C7EA';
const COVER_MUTED = '#8FA3D0';
const COVER_HAIR = '#22386E';

const LETTER_H = 792;
const PAGE_X = 56;
const PAGE_TOP = 54;
const PAGE_BOTTOM = 62;

const s = StyleSheet.create({
  // Cover ------------------------------------------------------------------
  cover: {
    backgroundColor: WAIZ.navy,
    color: WAIZ.white,
    paddingHorizontal: PAGE_X,
    paddingTop: 52,
    paddingBottom: 48,
    ...w(400),
    justifyContent: 'space-between',
  },
  coverTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  coverBrand: { fontSize: 10, letterSpacing: 2.2, color: WAIZ.accent, textTransform: 'uppercase', ...w(500) },
  coverDocType: { fontSize: 10, color: COVER_MUTED, ...w(500) },
  coverHero: { flexDirection: 'row', alignItems: 'stretch' },
  coverBar: { width: 3, backgroundColor: WAIZ.accent, marginRight: 22 },
  coverWelcome: { fontSize: 17, color: COVER_SOFT, ...w(400) },
  coverName: { fontSize: 50, lineHeight: 1.04, color: WAIZ.white, marginTop: 4, ...w(600), letterSpacing: -0.8 },
  coverCompany: { fontSize: 17, color: '#DCE6FF', marginTop: 14, ...w(400) },
  coverLead: { fontSize: 11, lineHeight: 1.55, color: COVER_SOFT, marginTop: 26, maxWidth: 360 },
  coverMetaRule: { height: 0.75, backgroundColor: COVER_HAIR, marginBottom: 16 },
  coverMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  coverMetaCell: { width: '28%' },
  coverMetaLabel: { fontSize: 8.5, color: COVER_MUTED, marginBottom: 4, ...w(500) },
  coverMetaValue: { fontSize: 11, color: WAIZ.white, ...w(500) },
  coverVersion: { fontSize: 7.5, color: COVER_MUTED, textAlign: 'right' },

  // Page -------------------------------------------------------------------
  page: {
    paddingTop: PAGE_TOP,
    paddingBottom: PAGE_BOTTOM,
    paddingHorizontal: PAGE_X,
    ...w(400),
    fontSize: 10.5,
    lineHeight: 1.5,
    color: INK,
  },
  // Anchored from the top: `bottom` on a fixed element resolves against the whole
  // document stack in @react-pdf 4.9 and lands the footer off-page.
  footer: {
    position: 'absolute',
    top: LETTER_H - 42,
    left: PAGE_X,
    right: PAGE_X,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: { fontSize: 8, color: MUTED },
  footerBrand: { fontSize: 8, ...w(500), color: WAIZ.navy },

  // Type -------------------------------------------------------------------
  h1: { fontSize: 26, color: WAIZ.navy, ...w(600), letterSpacing: -0.5, lineHeight: 1.15, marginBottom: 8 },
  h1Num: { color: WAIZ.accent, ...w(500) },
  h1Rule: { height: 0.75, backgroundColor: RULE, marginBottom: 14 },
  h2: { fontSize: 13.5, color: WAIZ.navy, ...w(600), marginTop: 16, marginBottom: 7, letterSpacing: -0.2 },
  h2First: { marginTop: 0 },
  h3: { fontSize: 11, color: WAIZ.royal, ...w(600), marginTop: 12, marginBottom: 4 },
  body: { marginBottom: 8, color: INK_SOFT },
  caption: { fontSize: 8.5, color: MUTED, lineHeight: 1.45, marginBottom: 6 },
  divider: { height: 0.6, backgroundColor: HAIR, marginVertical: 14 },
  spacer: { height: 12 },

  listRow: { flexDirection: 'row', marginBottom: 4, paddingRight: 6 },
  listNum: { width: 22, color: WAIZ.accent, ...w(500), fontSize: 10.5 },
  listSquare: { width: 4, height: 4, backgroundColor: WAIZ.navy, marginTop: 6, marginRight: 12 },
  listText: { flex: 1, color: INK_SOFT },

  callout: {
    borderLeftWidth: 2,
    borderLeftColor: WAIZ.accent,
    backgroundColor: TINT,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginTop: 6,
    marginBottom: 14,
  },
  // Unitless lineHeight resolves against the element's own fontSize, so both live on the Text.
  calloutText: { fontSize: 10.5, lineHeight: 1.5, color: WAIZ.navy },

  // Shared table bits ------------------------------------------------------
  block: { marginTop: 4, marginBottom: 12 },
  headRow: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: WAIZ.navy },
  headCell: { fontSize: 8.5, color: MUTED, ...w(500), paddingRight: 10 },
  row: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 0.6, borderBottomColor: HAIR },
  rowLast: { borderBottomWidth: 0 },
  cellKey: { fontSize: 10, color: WAIZ.navy, ...w(500), paddingRight: 12 },
  cell: { fontSize: 10, color: INK_SOFT, paddingRight: 10, lineHeight: 1.45 },
  link: { fontSize: 10, color: WAIZ.royal, textDecoration: 'none', ...w(500) },

  // kv / checklist ---------------------------------------------------------
  kvLabel: { fontSize: 9.5, color: MUTED, ...w(500), paddingRight: 12, paddingTop: 0.5 },
  kvValue: { fontSize: 10, color: INK, lineHeight: 1.4 },
  kvMuted: { color: MUTED },
  tickBox: { width: 10, height: 10, borderWidth: 1, borderColor: WAIZ.navy, marginRight: 12, marginTop: 2.5 },
  tickBoxOff: { borderColor: RULE },

  // receipt ----------------------------------------------------------------
  receipt: { flexDirection: 'row', backgroundColor: TINT, borderWidth: 0.6, borderColor: HAIR, marginTop: 6, marginBottom: 10 },
  receiptCell: { flex: 1, paddingVertical: 16, paddingHorizontal: 18, borderRightWidth: 0.6, borderRightColor: RULE },
  receiptCellLast: { borderRightWidth: 0 },
  receiptLabel: { fontSize: 8.5, color: MUTED, ...w(500), marginBottom: 6 },
  receiptValue: { fontSize: 15, color: WAIZ.navy, ...w(600), letterSpacing: -0.2, lineHeight: 1.2 },
  receiptMono: { fontFamily: MONO, fontWeight: 500, fontSize: 14.5, letterSpacing: 0.4 },

  // steps ------------------------------------------------------------------
  stepHead: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: WAIZ.navy, marginBottom: 4 },
  stepRow: { flexDirection: 'row', alignItems: 'stretch' },
  stepGutter: { width: 30, alignItems: 'center' },
  stepNode: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.2,
    borderColor: WAIZ.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepNodeText: { fontSize: 8.5, color: WAIZ.accent, ...w(500), lineHeight: 1 },
  stepLine: { flex: 1, width: 0.75, backgroundColor: RULE, marginTop: 3, marginBottom: 1 },
  stepMain: { paddingLeft: 10, paddingBottom: 7, paddingRight: 14 },
  stepTitle: { fontSize: 10.5, color: WAIZ.navy, ...w(600), marginTop: 3 },
  stepText: { fontSize: 10, color: INK_SOFT, marginTop: 1, lineHeight: 1.35 },
  stepYou: { paddingLeft: 14, paddingBottom: 7, borderLeftWidth: 0.6, borderLeftColor: HAIR },
  stepYouText: { fontSize: 10, color: WAIZ.navy, ...w(500), marginTop: 3, lineHeight: 1.35 },

  // compare ----------------------------------------------------------------
  compare: { flexDirection: 'row', marginTop: 4, marginBottom: 14 },
  panel: { flex: 1, padding: 11, borderWidth: 0.75, borderColor: RULE },
  panelDark: { flex: 1, padding: 11, backgroundColor: WAIZ.navy, marginLeft: 10 },
  panelHead: { fontSize: 8.5, ...w(500), marginBottom: 6 },
  panelRow: { flexDirection: 'row', marginBottom: 5 },
  panelMark: { width: 6, height: 6, marginTop: 4.5, marginRight: 10 },
  panelText: { flex: 1, fontSize: 10, lineHeight: 1.45 },

  // timeline ---------------------------------------------------------------
  timeline: { flexDirection: 'row', marginTop: 10, marginBottom: 14 },
  tlCell: { flex: 1, paddingRight: 14, position: 'relative' },
  tlTrack: { position: 'absolute', left: 0, right: 0, top: 3.5, height: 0.75, backgroundColor: RULE },
  tlTrackLast: { right: 14 },
  tlNode: { width: 8, height: 8, backgroundColor: WAIZ.accent },
  tlLabel: { fontSize: 10.5, color: WAIZ.navy, ...w(600), marginTop: 12 },
  tlText: { fontSize: 9.5, color: INK_SOFT, marginTop: 4, lineHeight: 1.45 },

  // rhythm -----------------------------------------------------------------
  rhythm: { flexDirection: 'row', marginTop: 6, marginBottom: 14 },
  rhCell: { flex: 1, borderTopWidth: 1.5, borderTopColor: WAIZ.navy, paddingTop: 9, marginRight: 14 },
  rhCellLast: { marginRight: 0 },
  rhLabel: { fontSize: 10.5, color: WAIZ.navy, ...w(600) },
  rhText: { fontSize: 9.5, color: INK_SOFT, marginTop: 4, lineHeight: 1.45 },

  // toc --------------------------------------------------------------------
  tocNum: { width: 30, fontSize: 10.5, color: WAIZ.accent, ...w(500) },
  tocTitle: { fontSize: 10.5, color: WAIZ.navy, ...w(600), paddingRight: 12 },
  tocQuestion: { fontSize: 9.5, color: MUTED, lineHeight: 1.45 },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal inline markup: <b>…</b> and <i>…</i>, as allowed by the Wm-os template. */
function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /<(b|i)>([\s\S]*?)<\/\1>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const style = m[1] === 'b' ? { ...w(600), color: WAIZ.navy } : { ...w(500), color: WAIZ.navy };
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

const URL_RE = /^https?:\/\/\S+$/i;

/** Values that are URLs become live links; everything else is plain text. */
function Value({ text, style, muted }: { text: string; style?: Style; muted?: boolean }) {
  const t = text.trim();
  if (URL_RE.test(t)) {
    return (
      <Link src={t} style={[s.link, style ?? {}]}>
        {t.replace(/^https?:\/\//i, '')}
      </Link>
    );
  }
  return <Text style={[s.kvValue, style ?? {}, muted ? s.kvMuted : {}]}>{inline(text)}</Text>;
}

function widthsFor(cols: number, col_widths?: number[]): number[] {
  return col_widths && col_widths.length === cols ? col_widths : Array.from({ length: cols }, () => 1 / cols);
}

function pct(n: number): string {
  return `${Math.round(n * 1000) / 10}%`;
}

// ---------------------------------------------------------------------------
// Table variants
// ---------------------------------------------------------------------------

type TableProps = { headers: string[]; rows: string[][]; col_widths?: number[]; variant?: KitTableVariant };

function Grid({ headers, rows, col_widths }: TableProps) {
  const cols = Math.max(headers.length, ...rows.map(r => r.length), 1);
  const widths = widthsFor(cols, col_widths);
  const showHeader = headers.some(h => h.trim());
  return (
    <View style={s.block} wrap={false}>
      {showHeader && (
        <View style={s.headRow}>
          {headers.map((h, i) => (
            <Text key={i} style={[s.headCell, { width: pct(widths[i]) }]}>
              {h}
            </Text>
          ))}
        </View>
      )}
      {rows.map((row, ri) => (
        <View key={ri} style={[s.row, ri === rows.length - 1 ? s.rowLast : {}]}>
          {Array.from({ length: cols }, (_, ci) => (
            <View key={ci} style={{ width: pct(widths[ci]) }}>
              {ci === 0 ? (
                <Text style={s.cellKey}>{inline(row[ci] ?? '')}</Text>
              ) : (
                <Text style={s.cell}>{inline(row[ci] ?? '')}</Text>
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Label / value list. No header row: the labels carry it. */
function Kv({ rows, col_widths }: TableProps) {
  const widths = widthsFor(2, col_widths?.length === 2 ? col_widths : [0.32, 0.68]);
  return (
    <View style={s.block} wrap={false}>
      {rows.map((row, ri) => (
        <View key={ri} style={[s.row, ri === rows.length - 1 ? s.rowLast : {}]}>
          <View style={{ width: pct(widths[0]) }}>
            <Text style={s.kvLabel}>{row[0] ?? ''}</Text>
          </View>
          <View style={{ width: pct(widths[1]) }}>
            <Value text={row[1] ?? ''} />
          </View>
        </View>
      ))}
    </View>
  );
}

const DECLINED_RE = /^declined/i;

/** Kv with a tick box. Declined rows keep their place but recede. */
function Checklist({ rows, col_widths }: TableProps) {
  const widths = widthsFor(2, col_widths?.length === 2 ? col_widths : [0.36, 0.64]);
  return (
    <View style={s.block} wrap={false}>
      {rows.map((row, ri) => {
        const off = DECLINED_RE.test((row[1] ?? '').trim());
        return (
          <View key={ri} style={[s.row, ri === rows.length - 1 ? s.rowLast : {}]}>
            <View style={[s.tickBox, off ? s.tickBoxOff : {}]} />
            <View style={{ width: pct(widths[0]) }}>
              <Text style={[s.cellKey, off ? s.kvMuted : {}]}>{row[0] ?? ''}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Value text={row[1] ?? ''} muted={off} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const MONO_LABEL_RE = /nmls|phone|number|#/i;

/** One row of large-value tiles. Numeric identifiers set in mono so they read like a receipt. */
function Receipt({ rows }: TableProps) {
  return (
    <View style={s.receipt} wrap={false}>
      {rows.map((row, ri) => {
        const label = row[0] ?? '';
        const mono = MONO_LABEL_RE.test(label) && /\d/.test(row[1] ?? '');
        const wide = ri === 0 && rows.length > 1;
        return (
          <View
            key={ri}
            style={[s.receiptCell, wide ? { flex: 1.5 } : {}, ri === rows.length - 1 ? s.receiptCellLast : {}]}
          >
            <Text style={s.receiptLabel}>{label}</Text>
            <Text style={[s.receiptValue, mono ? s.receiptMono : {}]}>{row[1] ?? ''}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Vertical stepper: [stage, what the prospect experiences, what you do]. */
function Steps({ headers, rows }: TableProps) {
  const mainW = '58%';
  const youW = '34%';
  return (
    <View style={s.block} wrap={false}>
      <View style={s.stepHead}>
        <View style={s.stepGutter} />
        <Text style={[s.headCell, { width: mainW, paddingLeft: 10 }]}>{headers[1] ?? ''}</Text>
        <Text style={[s.headCell, { width: youW, paddingLeft: 14 }]}>{headers[2] ?? ''}</Text>
      </View>
      {rows.map((row, ri) => {
        const last = ri === rows.length - 1;
        return (
          <View key={ri} style={s.stepRow}>
            <View style={s.stepGutter}>
              <View style={s.stepNode}>
                <Text style={s.stepNodeText}>{ri + 1}</Text>
              </View>
              {!last && <View style={s.stepLine} />}
            </View>
            <View style={[s.stepMain, { width: mainW }, last ? { paddingBottom: 2 } : {}]}>
              <Text style={s.stepTitle}>{row[0] ?? ''}</Text>
              <Text style={s.stepText}>{inline(row[1] ?? '')}</Text>
            </View>
            <View style={[s.stepYou, { width: youW }, last ? { paddingBottom: 2 } : {}]}>
              <Text style={s.stepYouText}>{inline(row[2] ?? '')}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Two panels side by side: the field on the left, Waiz on the right. */
function Compare({ headers, rows }: TableProps) {
  return (
    <View style={s.compare} wrap={false}>
      <View style={s.panel}>
        <Text style={[s.panelHead, { color: MUTED }]}>{headers[0] ?? ''}</Text>
        {rows.map((row, ri) => (
          <View key={ri} style={[s.panelRow, ri === rows.length - 1 ? { marginBottom: 0 } : {}]}>
            <View style={[s.panelMark, { borderWidth: 0.9, borderColor: MUTED }]} />
            <Text style={[s.panelText, { color: INK_SOFT }]}>{row[0] ?? ''}</Text>
          </View>
        ))}
      </View>
      <View style={s.panelDark}>
        <Text style={[s.panelHead, { color: WAIZ.accent }]}>{headers[1] ?? ''}</Text>
        {rows.map((row, ri) => (
          <View key={ri} style={[s.panelRow, ri === rows.length - 1 ? { marginBottom: 0 } : {}]}>
            <View style={[s.panelMark, { backgroundColor: WAIZ.accent }]} />
            <Text style={[s.panelText, { color: WAIZ.white, ...w(500) }]}>{row[1] ?? ''}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Horizontal milestones on a single track. */
function Timeline({ rows }: TableProps) {
  return (
    <View style={s.timeline} wrap={false}>
      {rows.map((row, ri) => {
        const last = ri === rows.length - 1;
        return (
          <View key={ri} style={[s.tlCell, last ? { paddingRight: 0 } : {}]}>
            <View style={[s.tlTrack, last ? { right: '40%' } : {}]} />
            <View style={s.tlNode} />
            <Text style={s.tlLabel}>{row[0] ?? ''}</Text>
            <Text style={s.tlText}>{inline(row[1] ?? '')}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Day strip: each block of the day gets its own column. */
function Rhythm({ rows }: TableProps) {
  return (
    <View style={s.rhythm} wrap={false}>
      {rows.map((row, ri) => (
        <View key={ri} style={[s.rhCell, ri === rows.length - 1 ? s.rhCellLast : {}]}>
          <Text style={s.rhLabel}>{row[0] ?? ''}</Text>
          <Text style={s.rhText}>{inline(row[1] ?? '')}</Text>
        </View>
      ))}
    </View>
  );
}

/** Contents: [number, title, question]. */
function Toc({ rows }: TableProps) {
  return (
    <View style={s.block} wrap={false}>
      {rows.map((row, ri) => (
        <View key={ri} style={[s.row, { paddingVertical: 9 }, ri === rows.length - 1 ? s.rowLast : {}]}>
          <Text style={s.tocNum}>{row[0] ?? ''}</Text>
          <View style={{ width: '32%' }}>
            <Text style={s.tocTitle}>{row[1] ?? ''}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.tocQuestion}>{row[2] ?? ''}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function Table(props: TableProps) {
  switch (props.variant) {
    case 'kv':
      return <Kv {...props} />;
    case 'checklist':
      return <Checklist {...props} />;
    case 'receipt':
      return <Receipt {...props} />;
    case 'steps':
      return <Steps {...props} />;
    case 'compare':
      return <Compare {...props} />;
    case 'timeline':
      return <Timeline {...props} />;
    case 'rhythm':
      return <Rhythm {...props} />;
    case 'toc':
      return <Toc {...props} />;
    default:
      return <Grid {...props} />;
  }
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

const H1_NUM_RE = /^(\d{2})\s+(.+)$/;

function Heading1({ text, first }: { text: string; first: boolean }) {
  const m = H1_NUM_RE.exec(text.trim());
  return (
    <View style={first ? {} : { marginTop: 16 }}>
      <Text style={s.h1}>
        {m && <Text style={s.h1Num}>{`${m[1]}   `}</Text>}
        {m ? m[2] : text}
      </Text>
      <View style={s.h1Rule} />
    </View>
  );
}

/** Split blocks into pages on `pagebreak`. */
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
        out.push(<Heading1 key={i} text={b.text} first={i === 0} />);
        break;
      case 'h2':
        out.push(
          <Text key={i} style={[s.h2, i === 0 ? s.h2First : {}]}>
            {b.text}
          </Text>,
        );
        break;
      case 'h3':
        out.push(
          <Text key={i} style={s.h3}>
            {b.text}
          </Text>,
        );
        break;
      case 'body':
        out.push(
          <Text key={i} style={s.body}>
            {inline(b.text)}
          </Text>,
        );
        break;
      case 'caption':
        out.push(
          <Text key={i} style={s.caption}>
            {inline(b.text)}
          </Text>,
        );
        break;
      case 'bullet':
        out.push(
          <View key={i} style={s.listRow}>
            <View style={s.listSquare} />
            <Text style={s.listText}>{inline(b.text)}</Text>
          </View>,
        );
        break;
      case 'numbered':
        n += 1;
        out.push(
          <View key={i} style={s.listRow}>
            <Text style={s.listNum}>{n}</Text>
            <Text style={s.listText}>{inline(b.text)}</Text>
          </View>,
        );
        break;
      case 'callout':
        out.push(
          <View key={i} style={s.callout} wrap={false}>
            <Text style={s.calloutText}>{inline(b.text)}</Text>
          </View>,
        );
        break;
      case 'table':
        out.push(<Table key={i} headers={b.headers} rows={b.rows} col_widths={b.col_widths} variant={b.variant} />);
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

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

function Cover({ cover }: { cover: KitCoverMeta }) {
  return (
    <Page size="LETTER" style={s.cover}>
      <View style={s.coverTop}>
        <Text style={s.coverBrand}>{WAIZ.brandName}</Text>
        <Text style={s.coverDocType}>{cover.title}</Text>
      </View>

      <View style={s.coverHero}>
        <View style={s.coverBar} />
        <View>
          <Text style={s.coverWelcome}>Welcome,</Text>
          <Text style={s.coverName}>{cover.welcomeName}</Text>
          <Text style={s.coverCompany}>{cover.subtitle}</Text>
          <Text style={s.coverLead}>{cover.lead}</Text>
        </View>
      </View>

      <View>
        <View style={s.coverMetaRule} />
        <View style={s.coverMetaRow}>
          <View style={s.coverMetaCell}>
            <Text style={s.coverMetaLabel}>Product</Text>
            <Text style={s.coverMetaValue}>{cover.productLabel}</Text>
          </View>
          <View style={s.coverMetaCell}>
            <Text style={s.coverMetaLabel}>Go-live</Text>
            <Text style={s.coverMetaValue}>{cover.goLiveLabel}</Text>
          </View>
          <View style={s.coverMetaCell}>
            <Text style={s.coverMetaLabel}>Prepared</Text>
            <Text style={s.coverMetaValue}>{cover.dateLabel}</Text>
          </View>
          <View style={{ width: '16%' }}>
            <Text style={s.coverVersion}>Kit v{cover.version}</Text>
            <Text style={s.coverVersion}>{cover.templateVersion}</Text>
          </View>
        </View>
      </View>
    </Page>
  );
}

export function LaunchKitDocument({ blocks, cover }: { blocks: KitBlock[]; cover: KitCoverMeta }): ReactElement {
  return (
    <Document
      title={`${cover.title}: ${cover.clientName}`}
      author={WAIZ.brandName}
      subject={cover.abstract}
      keywords={`launch kit v${cover.version}, template ${cover.templateVersion}`}
      creator="Mr. Waiz"
    >
      <Cover cover={cover} />
      {paginate(blocks).map((pageBlocks, pi) => (
        <Page key={pi} size="LETTER" style={s.page}>
          {renderPage(pageBlocks)}
          <View style={s.footer} fixed>
            <Text style={s.footerText}>
              <Text style={s.footerBrand}>{WAIZ.brandName}</Text>
              {`    ${cover.title} for ${cover.clientName}`}
            </Text>
            <Text style={s.footerText} render={({ pageNumber }) => `${pageNumber}`} />
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
