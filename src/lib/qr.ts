import QRCode from 'qrcode';
import type { EventState } from '../types';
import { encodeStateToLink } from './shareLink';

/** A share link plus a QR-code PNG (data URL) that encodes it. */
export interface ShareQr {
  link: string;
  dataUrl: string;
}

/**
 * Thrown when the text simply won't fit in a QR code. Share links embed the whole
 * event state in the URL, so large guest lists overflow a QR's ~2.9 KB ceiling —
 * callers should fall back to sharing the link directly (copy / WhatsApp).
 */
export class QrTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QrTooLargeError';
  }
}

/** Render an arbitrary string to a QR-code PNG data URL. */
export async function qrDataUrl(text: string, options?: QRCode.QRCodeToDataURLOptions): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      // Lowest error correction maximizes how much data fits before overflowing.
      errorCorrectionLevel: 'L',
      margin: 1,
      width: 512,
      color: { dark: '#0f172a', light: '#ffffff' },
      ...options,
    });
  } catch (err) {
    if (err instanceof Error && /too (big|long)|overflow|maximum/i.test(err.message)) {
      throw new QrTooLargeError(err.message);
    }
    throw err;
  }
}

/**
 * Build the current event's share link and a QR code for it, so guests can scan
 * to open the seating list and details on their phone. Throws {@link QrTooLargeError}
 * when the list is too big to encode.
 */
export async function buildShareQr(state: EventState): Promise<ShareQr> {
  const link = await encodeStateToLink(state);
  const dataUrl = await qrDataUrl(link);
  return { link, dataUrl };
}
