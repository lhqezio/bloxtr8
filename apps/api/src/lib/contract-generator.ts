import crypto from 'crypto';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

import { uploadBuffer, getPublicUrl } from '@bloxtr8/storage';

import type { ContractData } from '../templates/contract-terms.js';
import {
  getActiveContractTemplate,
  formatCurrencyAmount,
} from '../templates/contract-terms.js';

export interface GenerateContractOptions {
  contractId: string;
  offerId: string;
  listingId: string;
  seller: {
    id: string;
    name: string;
    email: string;
    kycTier: string;
    robloxAccountId?: string;
  };
  buyer: {
    id: string;
    name: string;
    email: string;
    kycTier: string;
    robloxAccountId?: string;
  };
  asset: {
    title: string;
    description: string;
    category: string;
    robloxData?: {
      gameId: string;
      gameName: string;
      gameDescription?: string;
      thumbnailUrl?: string;
      playerCount?: number;
      visits?: number;
      verifiedOwnership: boolean;
      ownershipType: string;
      verificationDate?: Date;
    };
  };
  financial: {
    amountCents: string | bigint;
    currency: string;
  };
  offer: {
    id: string;
    conditions?: string;
    acceptedAt: Date;
  };
}

export interface ContractGenerationResult {
  success: boolean;
  pdfUrl?: string;
  sha256?: string;
  templateVersion?: string;
  error?: string;
}

/**
 * Generate a PDF contract for a Roblox asset sale
 */
export async function generateContract(
  options: GenerateContractOptions
): Promise<ContractGenerationResult> {
  try {
    // Get the active contract template
    const template = getActiveContractTemplate();

    // Prepare contract data
    const contractData: ContractData = {
      contractId: options.contractId,
      templateVersion: template.version,
      createdAt: new Date(),
      seller: options.seller,
      buyer: options.buyer,
      asset: {
        listingId: options.listingId,
        title: options.asset.title,
        description: options.asset.description,
        category: options.asset.category,
        robloxData: options.asset.robloxData,
      },
      financial: {
        amount: options.financial.amountCents.toString(),
        currency: options.financial.currency,
        amountDisplay: formatCurrencyAmount(
          options.financial.amountCents,
          options.financial.currency
        ),
      },
      offer: options.offer,
    };

    // Generate contract content
    const contentLines = template.generateContent(contractData);

    // Create PDF
    const pdfBytes = await createPDF(contentLines, contractData);

    // Calculate SHA-256 hash
    const hash = crypto.createHash('sha256');
    hash.update(pdfBytes);
    const sha256 = hash.digest('hex');

    // Upload to S3
    const key = `contracts/${options.contractId}.pdf`;
    await uploadBuffer(pdfBytes, key, 'application/pdf');

    // Get public URL
    const pdfUrl = getPublicUrl(key);

    return {
      success: true,
      pdfUrl,
      sha256,
      templateVersion: template.version,
    };
  } catch (error) {
    console.error('Error generating contract:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Create a PDF document from contract content
 */
async function createPDF(
  contentLines: string[],
  contractData: ContractData
): Promise<Uint8Array> {
  // Create a new PDF document
  const pdfDoc = await PDFDocument.create();

  // Embed fonts
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const monoFont = await pdfDoc.embedFont(StandardFonts.Courier);

  // Page setup
  const pageWidth = 612; // 8.5 inches
  const pageHeight = 792; // 11 inches
  const margin = 72; // 1 inch
  const contentWidth = pageWidth - 2 * margin;
  const lineHeight = 14;
  const titleFontSize = 18;
  const headingFontSize = 12;
  const bodyFontSize = 10;
  const smallFontSize = 8;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  // Helper function to add a new page if needed
  const checkPageBreak = (neededSpace: number) => {
    if (y - neededSpace < margin) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
      return true;
    }
    return false;
  };

  // Helper function to draw text
  const drawText = (
    text: string,
    options: {
      font?: typeof regularFont;
      size?: number;
      color?: { r: number; g: number; b: number };
      maxWidth?: number;
    } = {}
  ) => {
    const font = options.font || regularFont;
    const size = options.size || bodyFontSize;
    const color = options.color || { r: 0, g: 0, b: 0 };
    const maxWidth = options.maxWidth || contentWidth;

    // Word wrap
    const words = text.split(' ');
    let line = '';
    const lines: string[] = [];

    for (const word of words) {
      const testLine = line + (line ? ' ' : '') + word;
      const testWidth = font.widthOfTextAtSize(testLine, size);

      if (testWidth > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) {
      lines.push(line);
    }

    // Draw each line
    for (const textLine of lines) {
      checkPageBreak(lineHeight);
      page.drawText(textLine, {
        x: margin,
        y,
        size,
        font,
        color: rgb(color.r, color.g, color.b),
      });
      y -= lineHeight;
    }
  };

  // Process content lines
  for (const line of contentLines) {
    if (!line.trim()) {
      // Empty line - add spacing
      y -= lineHeight / 2;
      continue;
    }

    if (line === '---') {
      // Horizontal rule
      checkPageBreak(lineHeight);
      page.drawLine({
        start: { x: margin, y },
        end: { x: pageWidth - margin, y },
        thickness: 1,
        color: rgb(0.7, 0.7, 0.7),
      });
      y -= lineHeight;
      continue;
    }

    // Check if it's a title (all caps line)
    if (line === line.toUpperCase() && line.length > 5 && !line.includes(':')) {
      checkPageBreak(titleFontSize + lineHeight);
      drawText(line, {
        font: boldFont,
        size: titleFontSize,
        color: { r: 0, g: 0.4, b: 0.6 },
      });
      y -= lineHeight / 2;
      continue;
    }

    // Check if it's a section heading (starts with number)
    if (/^\d+\./.test(line)) {
      y -= lineHeight / 2; // Extra spacing before sections
      checkPageBreak(headingFontSize + lineHeight);
      drawText(line, {
        font: boldFont,
        size: headingFontSize,
        color: { r: 0.1, g: 0.1, b: 0.1 },
      });
      continue;
    }

    // Check if it's a subheading (all caps with colon or starts with specific keywords)
    if (
      (line === line.toUpperCase() && line.includes(':')) ||
      line.startsWith('SELLER:') ||
      line.startsWith('BUYER:') ||
      line.startsWith('ROBLOX ASSET DETAILS:')
    ) {
      checkPageBreak(bodyFontSize + lineHeight);
      drawText(line, {
        font: boldFont,
        size: bodyFontSize,
      });
      continue;
    }

    // Check if it's indented (sub-item)
    if (line.startsWith('  ')) {
      drawText(line, {
        font: regularFont,
        size: smallFontSize,
      });
      continue;
    }

    // Regular body text
    drawText(line, {
      font: regularFont,
      size: bodyFontSize,
    });
  }

  // Add footer to all pages
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;

  for (let i = 0; i < totalPages; i++) {
    const currentPage = pages[i];
    currentPage.drawText(`Page ${i + 1} of ${totalPages}`, {
      x: margin,
      y: margin / 2,
      size: smallFontSize,
      font: regularFont,
      color: rgb(0.5, 0.5, 0.5),
    });

    currentPage.drawText(`Contract ID: ${contractData.contractId}`, {
      x: pageWidth - margin - 150,
      y: margin / 2,
      size: smallFontSize,
      font: monoFont,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  // Serialize the PDF
  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

/**
 * Verify the integrity of a contract PDF
 */
export async function verifyContract(
  pdfBytes: Uint8Array,
  expectedHash: string
): Promise<boolean> {
  try {
    const hash = crypto.createHash('sha256');
    hash.update(pdfBytes);
    const actualHash = hash.digest('hex');
    return actualHash === expectedHash;
  } catch (error) {
    console.error('Error verifying contract:', error);
    return false;
  }
}

/**
 * Extract contract data hash for signature verification
 */
export function getContractHash(contractId: string, pdfHash: string): string {
  const data = `${contractId}:${pdfHash}`;
  const hash = crypto.createHash('sha256');
  hash.update(data);
  return hash.digest('hex');
}

