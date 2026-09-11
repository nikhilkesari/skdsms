/**
 * Sked SMS — SMS Segmentation & Encoding Calculator
 * Target: src/utils/smsCalculator.ts
 */

import type { SmsSegmentResult } from '../types/schedule';

export type { SmsSegmentResult };

/**
 * Calculates SMS character count, segment count, Unicode detection, and total payload bytes.
 *
 * Encoding Rules:
 * - GSM-7: Standard ASCII printable (\x20-\x7E) plus \r, \n, \t.
 *   - Single segment: up to 160 characters.
 *   - Multipart segment: 153 characters per segment (7 characters reserved for UDH header).
 * - UCS-2 (Unicode): Any character outside standard GSM-7 (e.g. emojis, accents, non-Latin scripts).
 *   - Single segment: up to 70 characters.
 *   - Multipart segment: 67 characters per segment (3 characters reserved for UDH header).
 *
 * Code Points:
 * - Uses Array.from(text) to properly count surrogate pairs (emojis) as single characters.
 */
export function calculateSmsSegments(text: string): SmsSegmentResult {
  if (!text) {
    return {
      charCount: 0,
      segmentCount: 0,
      isUnicode: false,
      bytesTotal: 0,
    };
  }

  // Check for characters outside standard GSM-7 basic charset
  // Standard ASCII printable + standard whitespace
  const isGsm7 = /^[\x20-\x7E\r\n\t]*$/.test(text);
  const isUnicode = !isGsm7;

  // Use Array.from to correctly count Unicode code points (emojis as 1 char)
  const codePoints = Array.from(text);
  const charCount = codePoints.length;

  if (charCount === 0) {
    return {
      charCount: 0,
      segmentCount: 0,
      isUnicode,
      bytesTotal: 0,
    };
  }

  let segmentCount: number;
  let bytesTotal: number;

  if (!isUnicode) {
    bytesTotal = text.length; // 1 byte per GSM-7 char
    if (charCount <= 160) {
      segmentCount = 1;
    } else {
      segmentCount = Math.ceil(charCount / 153);
    }
  } else {
    bytesTotal = text.length * 2; // UCS-2 2 bytes per char
    if (charCount <= 70) {
      segmentCount = 1;
    } else {
      segmentCount = Math.ceil(charCount / 67);
    }
  }

  return {
    charCount,
    segmentCount,
    isUnicode,
    bytesTotal,
  };
}
