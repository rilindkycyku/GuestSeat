import jsPDF from 'jspdf';
import type { AgendaItem, EventState, InvitationTemplate } from '../types';
import type { Translator } from './tableDisplay';
import type { Language } from './i18n';
import { BRAND, formatEventDate, generatedHost, slug } from './exportData';

type RGB = [number, number, number];

/** UI metadata for the design picker in the invitation editor. `swatch` drives the thumbnail. */
export interface InvitationTemplateMeta {
  id: InvitationTemplate;
  labelKey: string;
  descKey: string;
  /** [background, accent, ink] hex colors used to paint the little preview card. */
  swatch: [string, string, string];
}

export const INVITATION_TEMPLATES: InvitationTemplateMeta[] = [
  { id: 'classic', labelKey: 'invitation.designClassic', descKey: 'invitation.designClassicDesc', swatch: ['#faf7f1', '#b08d57', '#333333'] },
  { id: 'modern', labelKey: 'invitation.designModern', descKey: 'invitation.designModernDesc', swatch: ['#ffffff', '#475569', '#1f2937'] },
  { id: 'romantic', labelKey: 'invitation.designRomantic', descKey: 'invitation.designRomanticDesc', swatch: ['#fff6f7', '#c98a9b', '#7d5260'] },
];

// ── Icons ─────────────────────────────────────────────────────────────────────────────────
// Small vector line-art drawn straight into the PDF (no bitmaps), echoing the icons on a
// classic invitation card: a welcome cocktail, the ceremony arch, the bride's entrance,
// dinner, the cake, and the rings. Each maps a schedule item to a recognisable glyph.

type IconKind = 'cocktail' | 'arch' | 'bride' | 'dinner' | 'cake' | 'rings' | 'heart';

/** Choose the glyph that best fits a schedule line, by keyword (Albanian + English). */
function iconForAgenda(item: AgendaItem): IconKind {
  const s = `${item.title} ${item.time ?? ''}`.toLowerCase();
  const has = (...w: string[]) => w.some((x) => s.includes(x));
  if (has('cocktail', 'koktej', 'drink', 'pije', 'aperitiv', 'welcome', 'mirëseardhje', 'miresardhje', 'gotë', 'gote')) return 'cocktail';
  if (has('ceremon', 'kuror', 'kunor', 'arch', 'vow', 'martes', 'wedding', 'ritual', 'unaz', 'ring')) return has('unaz', 'ring') ? 'rings' : 'arch';
  if (has('bride', 'nus', 'entrance', 'entry', 'ardhja', 'hyrja', 'hyrje', 'dhëndr', 'dhendr', 'walk')) return 'bride';
  if (has('dinner', 'darka', 'darkë', 'darke', 'food', 'ushqim', 'meal', 'buffet', 'lunch', 'drek')) return 'dinner';
  if (has('cake', 'tort', 'ëmbëls', 'embels', 'dessert', 'sweet')) return 'cake';
  if (has('dance', 'valle', 'party', 'aheng', 'muzik', 'music', 'dj', 'gëzim', 'gezim', 'love', 'dashuri', 'first')) return 'rings';
  return 'heart';
}

const setStroke = (doc: jsPDF, c: RGB, w: number) => {
  doc.setDrawColor(...c);
  doc.setLineWidth(w);
};

/** A small filled heart centered at (cx, cy); `r` is roughly its half-width. */
function drawHeart(doc: jsPDF, cx: number, cy: number, r: number, color: RGB): void {
  doc.setFillColor(...color);
  doc.circle(cx - r * 0.5, cy - r * 0.28, r * 0.52, 'F');
  doc.circle(cx + r * 0.5, cy - r * 0.28, r * 0.52, 'F');
  doc.triangle(cx - r * 0.98, cy - r * 0.12, cx + r * 0.98, cy - r * 0.12, cx, cy + r * 0.9, 'F');
}

/** Draw one icon, centered at (cx, cy), fitting within radius `r`, in `color`. */
function drawIcon(doc: jsPDF, kind: IconKind, cx: number, cy: number, r: number, color: RGB): void {
  const lw = Math.max(0.3, r * 0.13);
  setStroke(doc, color, lw);
  switch (kind) {
    case 'cocktail': {
      doc.triangle(cx - r, cy - r * 0.7, cx + r, cy - r * 0.7, cx, cy + r * 0.2, 'S'); // bowl
      doc.line(cx, cy + r * 0.2, cx, cy + r); // stem
      doc.line(cx - r * 0.55, cy + r, cx + r * 0.55, cy + r); // base
      drawHeart(doc, cx + r * 0.45, cy - r * 0.42, r * 0.28, color); // garnish
      break;
    }
    case 'arch': {
      doc.line(cx - r * 0.8, cy + r, cx - r * 0.8, cy - r * 0.3); // left post
      doc.line(cx + r * 0.8, cy + r, cx + r * 0.8, cy - r * 0.3); // right post
      doc.lines([[r * 0.2, -r * 1.1, r * 1.4, -r * 1.1, r * 1.6, 0]], cx - r * 0.8, cy - r * 0.3, [1, 1], 'S'); // arch
      doc.setFillColor(...color);
      doc.circle(cx, cy - r * 1.02, r * 0.13, 'F'); // hanging bloom
      break;
    }
    case 'bride': {
      doc.circle(cx, cy - r * 0.62, r * 0.2, 'S'); // head
      doc.triangle(cx, cy - r * 0.34, cx - r * 0.5, cy + r, cx + r * 0.5, cy + r, 'S'); // dress
      doc.lines([[-r * 0.2, r * 0.45, -r * 0.5, r * 0.95, -r * 0.55, r * 1.35]], cx - r * 0.12, cy - r * 0.5, [1, 1], 'S'); // veil
      break;
    }
    case 'dinner': {
      doc.circle(cx, cy, r * 0.72, 'S'); // plate
      doc.circle(cx, cy, r * 0.42, 'S'); // inner
      doc.line(cx - r * 1.08, cy - r * 0.75, cx - r * 1.08, cy + r * 0.75); // fork
      doc.line(cx + r * 1.08, cy - r * 0.75, cx + r * 1.08, cy + r * 0.75); // knife
      break;
    }
    case 'cake': {
      doc.line(cx - r, cy + r, cx + r, cy + r); // stand
      doc.rect(cx - r * 0.8, cy + r * 0.15, r * 1.6, r * 0.7, 'S'); // bottom tier
      doc.rect(cx - r * 0.5, cy - r * 0.45, r * 1.0, r * 0.6, 'S'); // top tier
      drawHeart(doc, cx, cy - r * 0.72, r * 0.26, color); // topper
      break;
    }
    case 'rings': {
      doc.circle(cx - r * 0.42, cy, r * 0.62, 'S');
      doc.circle(cx + r * 0.42, cy, r * 0.62, 'S');
      break;
    }
    case 'heart':
    default:
      drawHeart(doc, cx, cy, r * 0.9, color);
      break;
  }
}

// ── Templates ───────────────────────────────────────────────────────────────────────────

interface Style {
  bg?: RGB;
  ink: RGB;
  muted: RGB;
  accent: RGB;
  accentSoft: RGB;
  nameFont: 'times' | 'helvetica';
  nameStyle: string;
  nameUpper: boolean;
  nameSpacing: number;
  frame: 'double' | 'thin' | 'none';
  corners: boolean;
  separator: 'amp' | 'rule' | 'heart';
}

export const STYLES: Record<InvitationTemplate, Style> = {
  classic: {
    bg: [250, 247, 241], ink: [51, 51, 51], muted: [120, 120, 120], accent: [176, 141, 87], accentSoft: [206, 183, 142],
    nameFont: 'times', nameStyle: 'normal', nameUpper: false, nameSpacing: 0, frame: 'double', corners: false, separator: 'amp',
  },
  modern: {
    bg: [255, 255, 255], ink: [31, 41, 55], muted: [148, 163, 184], accent: [71, 85, 105], accentSoft: [203, 213, 225],
    nameFont: 'helvetica', nameStyle: 'normal', nameUpper: true, nameSpacing: 1.2, frame: 'thin', corners: false, separator: 'rule',
  },
  romantic: {
    bg: [255, 246, 247], ink: [125, 82, 96], muted: [176, 140, 150], accent: [201, 138, 155], accentSoft: [230, 196, 205],
    nameFont: 'times', nameStyle: 'italic', nameUpper: false, nameSpacing: 0, frame: 'none', corners: true, separator: 'heart',
  },
};

interface Content {
  intro: string;
  brideName: string;
  groomName: string;
  eventName: string;
  dateLine: string;
  venue: string;
  address: string;
  agenda: AgendaItem[];
  note: string;
  scheduleHeading: string;
}

/** A small decorative bracket + dot in each corner, for the romantic design. */
function drawCorners(doc: jsPDF, pageW: number, pageH: number, m: number, style: Style): void {
  const len = 10;
  const set = (c: RGB, w: number) => setStroke(doc, c, w);
  const corner = (x: number, y: number, sx: number, sy: number) => {
    set(style.accent, 0.5);
    doc.line(x, y, x + sx * len, y);
    doc.line(x, y, x, y + sy * len);
    set(style.accentSoft, 0.3);
    doc.line(x + sx * 2, y + sy * 2, x + sx * (len - 2), y + sy * 2);
    doc.line(x + sx * 2, y + sy * 2, x + sx * 2, y + sy * (len - 2));
    doc.setFillColor(...style.accent);
    doc.circle(x + sx * 2.5, y + sy * 2.5, 0.7, 'F');
  };
  corner(m, m, 1, 1);
  corner(pageW - m, m, -1, 1);
  corner(m, pageH - m, 1, -1);
  corner(pageW - m, pageH - m, -1, -1);
}

/** Render the whole single-page invitation for the given style. */
export function renderInvitation(doc: jsPDF, style: Style, c: Content, t: Translator): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const cx = pageW / 2;
  const frameM = 12;
  const contentWidth = pageW - frameM * 2 - 20;

  if (style.bg) {
    doc.setFillColor(...style.bg);
    doc.rect(0, 0, pageW, pageH, 'F');
  }
  if (style.frame === 'double') {
    setStroke(doc, style.accent, 0.8);
    doc.roundedRect(frameM, frameM, pageW - frameM * 2, pageH - frameM * 2, 4, 4);
    setStroke(doc, style.accentSoft, 0.2);
    doc.roundedRect(frameM + 2.5, frameM + 2.5, pageW - (frameM + 2.5) * 2, pageH - (frameM + 2.5) * 2, 3, 3);
  } else if (style.frame === 'thin') {
    setStroke(doc, style.accentSoft, 0.5);
    doc.rect(frameM, frameM, pageW - frameM * 2, pageH - frameM * 2);
  }
  if (style.corners) drawCorners(doc, pageW, pageH, frameM, style);

  let y = frameM + 22;

  const centered = (
    text: string,
    size: number,
    o: { font?: 'times' | 'helvetica'; style?: string; color?: RGB; gap?: number; lineHeight?: number; spacing?: number; upper?: boolean } = {}
  ) => {
    const { font = 'times', style: fs = 'normal', color = style.ink, gap = 6, lineHeight = size * 0.52, spacing = 0, upper = false } = o;
    doc.setFont(font, fs);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.setCharSpace(spacing);
    const value = upper ? text.toUpperCase() : text;
    for (const line of doc.splitTextToSize(value, contentWidth) as string[]) {
      doc.text(line, cx, y, { align: 'center' });
      y += lineHeight;
    }
    doc.setCharSpace(0);
    y += gap;
  };

  const rule = (w = 40) => {
    setStroke(doc, style.accent, 0.4);
    doc.line(cx - w / 2, y, cx + w / 2, y);
    y += 8;
  };

  // Intro line.
  centered(c.intro, style.frame === 'none' ? 9.5 : 10, { font: 'helvetica', color: style.muted, gap: 8, lineHeight: 4.5, spacing: style.nameUpper ? 0.4 : 0, upper: style.nameUpper });

  // Names, with a per-design separator. The heart/rule dividers are placed in the clear band
  // between the two names (relative to the bride's baseline `yb`) so they never touch the text.
  const nameOpts = { font: style.nameFont, style: style.nameStyle, spacing: style.nameSpacing, upper: style.nameUpper };
  const bigSize = style.nameUpper ? 24 : 30;
  if (c.brideName || c.groomName) {
    const both = !!(c.brideName && c.groomName);
    const drawnSep = both && style.separator !== 'amp';
    const yb = y;
    if (c.brideName) centered(c.brideName, bigSize, { ...nameOpts, gap: drawnSep ? 5 : 2 });
    if (both) {
      if (style.separator === 'amp') {
        centered('&', 16, { color: style.accent, style: 'italic', gap: 2 });
      } else {
        const sepY = yb + bigSize * 0.52 * 0.6;
        if (style.separator === 'heart') {
          drawHeart(doc, cx, sepY, 2.2, style.accent);
        } else {
          setStroke(doc, style.accentSoft, 0.5);
          doc.line(cx - 9, sepY, cx + 9, sepY);
        }
      }
    }
    if (c.groomName) centered(c.groomName, bigSize, { ...nameOpts, gap: 6 });
  } else {
    centered(c.eventName, style.nameUpper ? 22 : 26, { ...nameOpts, gap: 6 });
  }

  rule();

  if (c.dateLine) centered(c.dateLine, 13, { font: 'helvetica', gap: 3, lineHeight: 6, spacing: style.nameUpper ? 0.6 : 0, upper: style.nameUpper });
  if (c.venue) centered(c.venue, 14, { style: 'bold', font: style.nameFont, gap: c.address ? 1 : 6 });
  if (c.address) centered(c.address, 10, { font: 'helvetica', color: style.muted, gap: 6, lineHeight: 5 });

  // Icon schedule timeline — the heart of the redesign.
  const agenda = c.agenda.slice(0, 6);
  if (agenda.length) {
    rule(30);
    centered(c.scheduleHeading.toUpperCase(), 9, { font: 'helvetica', color: style.accent, gap: 6, lineHeight: 4, spacing: 0.8 });
    const slot = contentWidth / agenda.length;
    const r = Math.min(slot * 0.26, 5.5);
    const startX = cx - contentWidth / 2 + slot / 2;
    const iconY = y + r;
    agenda.forEach((item, i) => {
      const ix = startX + i * slot;
      drawIcon(doc, iconForAgenda(item), ix, iconY, r, style.accent);
      let ty = iconY + r + 4.5;
      if (item.time?.trim()) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...style.ink);
        doc.text(item.time.trim(), ix, ty, { align: 'center' });
        ty += 4;
      }
      if (item.title.trim()) {
        doc.setFont(style.nameFont, style.nameFont === 'times' ? 'italic' : 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...style.muted);
        for (const line of (doc.splitTextToSize(item.title.trim(), slot - 2) as string[]).slice(0, 2)) {
          doc.text(line, ix, ty, { align: 'center' });
          ty += 3.4;
        }
      }
    });
    y = iconY + r + 4.5 + 14;
  }

  if (c.note) {
    rule(30);
    centered(c.note, 11.5, { style: 'italic', font: style.nameFont, color: style.ink, gap: 6, lineHeight: 5.5 });
  }

  // Closing flourish toward the foot.
  const flourishY = Math.max(y + 4, pageH - frameM - 20);
  if (style.separator === 'heart' || style.corners) {
    drawHeart(doc, cx, flourishY - 2, 2.2, style.accent);
  } else {
    doc.setFont('times', 'italic');
    doc.setFontSize(13);
    doc.setTextColor(...style.accent);
    doc.text('~', cx, flourishY, { align: 'center' });
  }

  // Subtle origin stamp, so the printed card shows where it was made.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...style.muted);
  doc.setCharSpace(0.3);
  doc.text(`${t('export.madeWith', { brand: BRAND })}  ·  ${generatedHost()}`, cx, pageH - frameM - 6, { align: 'center' });
  doc.setCharSpace(0);
}

/**
 * A single-page, print-ready guest invitation. Bride & groom, date/time, venue, an
 * icon-illustrated schedule (welcome cocktail, ceremony, bride's entrance, dinner, cake,
 * rings) and a personal note. Three visual designs — classic, modern, romantic — are chosen
 * via `details.invitationTemplate`. Every field is optional; the layout skips blanks. No QR
 * lives here on purpose: an invitation shouldn't expose the whole guest list to whoever holds it.
 */
export async function exportInvitationPdf(state: EventState, t: Translator, lang: Language): Promise<void> {
  const details = state.details ?? {};
  const template: InvitationTemplate = details.invitationTemplate ?? 'classic';
  const style = STYLES[template] ?? STYLES.classic;

  const dateStr = details.date ? formatEventDate(details.date, lang) : '';
  const dateLine = details.date
    ? details.time
      ? `${dateStr} · ${details.time}`
      : dateStr
    : details.time ?? '';

  const content: Content = {
    intro: t('invitation.intro'),
    brideName: details.brideName?.trim() ?? '',
    groomName: details.groomName?.trim() ?? '',
    eventName: state.eventName,
    dateLine,
    venue: details.venue?.trim() ?? '',
    address: details.address?.trim() ?? '',
    agenda: (details.agenda ?? []).filter((a) => a.title.trim() || a.time?.trim()),
    note: details.invitationNote?.trim() ?? '',
    scheduleHeading: t('invitation.scheduleHeading'),
  };

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  renderInvitation(doc, style, content, t);
  doc.save(`${slug(state.eventName)}-invitation-${template}.pdf`);
}
