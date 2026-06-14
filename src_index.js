import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);

      if (request.method === 'GET' && url.pathname === '/') {
        return json({
          success: true,
          message: 'LAI PDF Approval Stamp Worker is running',
          endpoint: 'POST /stamp'
        });
      }

      if (request.method !== 'POST' || url.pathname !== '/stamp') {
        return json({ success: false, message: 'Use POST /stamp' }, 404);
      }

      const body = await request.json();

      const pdfBase64 = body.pdfBase64;
      const fileName = body.fileName || 'approved.pdf';
      const approvedByName = body.approvedByName || 'Unknown User';
      const bookingNumber = body.bookingNumber || '';
      const approvalDateTime = body.approvalDateTime || new Date().toISOString();

      if (!pdfBase64) {
        return json({ success: false, message: 'Missing pdfBase64' }, 400);
      }

      const cleanBase64 = cleanPdfBase64(pdfBase64);
      const pdfBytes = base64ToUint8Array(cleanBase64);

      const pdfDoc = await PDFDocument.load(pdfBytes, {
        ignoreEncryption: true
      });

      const pages = pdfDoc.getPages();

      if (!pages || !pages.length) {
        return json({ success: false, message: 'PDF has no pages' }, 400);
      }

      const page = pages[0];

      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);

      const stampDateText = formatStampDate(approvalDateTime);

      const line1 = 'APPROVED';
      const line2 = `By ${approvedByName} at ${stampDateText}`;
      const line3 = bookingNumber ? `Booking ${bookingNumber}` : '';

      const existingApprovals =
  Number(body.existingApprovalCount || 0);

drawApprovalStamp(page, {
  line1,
  line2,
  line3,
  boldFont,
  italicFont,
  approvalIndex: existingApprovals
});

      const stampedBytes = await pdfDoc.save({
        useObjectStreams: false
      });

      const stampedBase64 = uint8ArrayToBase64(stampedBytes);

      return json({
        success: true,
        fileName: buildApprovedFileName(fileName),
        pdfBase64: stampedBase64,
        approvedByName,
        bookingNumber,
        approvalDateTime
      });

    } catch (e) {
      return json({
        success: false,
        message: e.message || String(e)
      }, 500);
    }
  }
};

function drawApprovalStamp(page, options) {
  const {
    line1,
    line2,
    line3,
    boldFont,
    italicFont
  } = options;

  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();

  const stampWidth = 300;
  const stampHeight = line3 ? 78 : 64;

  /*
    Account summary area placement:
    - Horizontally centered
    - Slightly below center of page 1
    - This lands around the speaker fee / deposit / balance area
  */
  const x = (pageWidth - stampWidth) / 2;
  const approvalIndex = options.approvalIndex || 0;

const baseY = (pageHeight / 2) + 15;
const verticalSpacing = 90;

const y = baseY - (approvalIndex * verticalSpacing);

  const green = rgb(0.22, 0.43, 0.12);
  const lightGreen = rgb(0.91, 0.96, 0.86);

  page.drawRectangle({
    x,
    y,
    width: stampWidth,
    height: stampHeight,
    borderColor: green,
    borderWidth: 2,
    color: lightGreen,
    opacity: 0.92
  });

  page.drawText(line1, {
    x: x + 14,
    y: y + stampHeight - 28,
    size: 22,
    font: italicFont,
    color: green
  });

  page.drawText(line2, {
    x: x + 14,
    y: y + stampHeight - 50,
    size: 14,
    font: italicFont,
    color: green
  });

  if (line3) {
    page.drawText(line3, {
      x: x + 14,
      y: y + 10,
      size: 11,
      font: boldFont,
      color: green
    });
  }
}

function cleanPdfBase64(value) {
  return String(value || '')
    .replace(/^data:application\/pdf;base64,/i, '')
    .replace(/\s/g, '');
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const length = binary.length;
  const bytes = new Uint8Array(length);

  for (let i = 0; i < length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function uint8ArrayToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }

  return btoa(binary);
}

function formatStampDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const datePart = date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York'
  });

  const timePart = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York'
  }).toLowerCase();

  return `${timePart}, ${datePart}`;
}

function buildApprovedFileName(fileName) {
  const cleanName = String(fileName || 'approved.pdf');

  if (/^APPROVED_/i.test(cleanName)) {
    return cleanName;
  }

  if (cleanName.toLowerCase().endsWith('.pdf')) {
    return cleanName.replace(/\.pdf$/i, '_APPROVED.pdf');
  }

  return `${cleanName}_APPROVED.pdf`;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
