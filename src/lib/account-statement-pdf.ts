import PDFDocument from "pdfkit";
import { formatBdtPaisa, parseBdtPaisa } from "@/lib/bdt-money";

type PdfDocument = InstanceType<typeof PDFDocument>;

export type AccountStatementPdfData = {
  bankName: string;
  customerName: string;
  customerEmail: string;
  accountNumber: string;
  accountType: string;
  currency: string;
  startDate: string | null;
  endDate: string | null;
  generatedAt: Date;
  openingBalance: string;
  closingBalance: string;
  transactions: Array<{
    transactionId: string;
    description: string;
    debit: string;
    credit: string;
    balance: string;
    createdAt: Date | string;
  }>;
};

const COLORS = {
  navy: "#142B4A",
  green: "#047857",
  text: "#263449",
  muted: "#64748B",
  border: "#DCE4EC",
  light: "#F4F7FA",
  white: "#FFFFFF",
};

const PAGE_MARGIN = 38;
const FOOTER_SPACE = 38;
const TABLE_COLUMNS = [
  { label: "Date", width: 61, align: "left" as const },
  { label: "Transaction ID", width: 98, align: "left" as const },
  { label: "Description", width: 144, align: "left" as const },
  { label: "Debit (BDT)", width: 68, align: "right" as const },
  { label: "Credit (BDT)", width: 68, align: "right" as const },
  { label: "Balance (BDT)", width: 80, align: "right" as const },
];

function formatBdt(value: string) {
  const paisa = parseBdtPaisa(value);
  if (paisa === null) throw new Error("Statement contains an invalid BDT amount.");
  const formatted = formatBdtPaisa(paisa);
  const [whole, fraction] = formatted.split(".");
  return `BDT ${BigInt(whole).toLocaleString("en-US")}.${fraction}`;
}

function displayDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function periodLabel(startDate: string | null, endDate: string | null) {
  return `${startDate ?? "Account opening"} to ${endDate ?? "Present"}`;
}

function drawTableHeader(doc: PdfDocument, y: number) {
  const tableWidth = TABLE_COLUMNS.reduce((sum, column) => sum + column.width, 0);
  doc.roundedRect(PAGE_MARGIN, y, tableWidth, 25, 5).fill(COLORS.navy);
  let x = PAGE_MARGIN;
  for (const column of TABLE_COLUMNS) {
    doc
      .font("Helvetica-Bold")
      .fontSize(7)
      .fillColor(COLORS.white)
      .text(column.label, x + 5, y + 8, {
        width: column.width - 10,
        align: column.align,
        lineBreak: false,
      });
    x += column.width;
  }
  return y + 25;
}

function drawContinuationHeader(doc: PdfDocument, data: AccountStatementPdfData) {
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(COLORS.navy)
    .text(data.bankName, PAGE_MARGIN, PAGE_MARGIN, { lineBreak: false });
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text(`Account statement · ${data.accountNumber} · continued`, PAGE_MARGIN, PAGE_MARGIN + 19, {
      lineBreak: false,
    });
  return drawTableHeader(doc, PAGE_MARGIN + 38);
}

function drawRow(doc: PdfDocument, data: AccountStatementPdfData["transactions"][number], y: number) {
  const tableWidth = TABLE_COLUMNS.reduce((sum, column) => sum + column.width, 0);
  const description = data.description.trim() || "—";
  const descriptionWidth = TABLE_COLUMNS[2].width - 10;
  const descriptionHeight = doc
    .font("Helvetica")
    .fontSize(7.5)
    .heightOfString(description, { width: descriptionWidth, lineGap: 1 });
  const rowHeight = Math.max(25, descriptionHeight + 12);
  doc.rect(PAGE_MARGIN, y, tableWidth, rowHeight).fill(COLORS.white);
  doc.rect(PAGE_MARGIN, y, tableWidth, rowHeight).stroke(COLORS.border);

  const cells = [
    displayDate(data.createdAt),
    data.transactionId,
    description,
    data.debit === "0.00" ? "—" : formatBdt(data.debit).replace("BDT ", ""),
    data.credit === "0.00" ? "—" : formatBdt(data.credit).replace("BDT ", ""),
    formatBdt(data.balance).replace("BDT ", ""),
  ];
  let x = PAGE_MARGIN;
  cells.forEach((cell, index) => {
    const column = TABLE_COLUMNS[index];
    doc
      .font(index === 1 ? "Helvetica-Bold" : "Helvetica")
      .fontSize(7.5)
      .fillColor(COLORS.text)
      .text(cell, x + 5, y + 6, {
        width: column.width - 10,
        height: rowHeight - 10,
        align: column.align,
        lineGap: 1,
        ellipsis: true,
      });
    x += column.width;
  });
  return y + rowHeight;
}

function addPageFooter(doc: PdfDocument, pageNumber: number, totalPages: number) {
  const footerY = doc.page.height - PAGE_MARGIN - 12;
  doc
    .moveTo(PAGE_MARGIN, footerY - 8)
    .lineTo(doc.page.width - PAGE_MARGIN, footerY - 8)
    .strokeColor(COLORS.border)
    .stroke();
  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor(COLORS.muted)
    .text("Northstar Bank · Confidential account information", PAGE_MARGIN, footerY, {
      lineBreak: false,
    })
    .text(`Page ${pageNumber} of ${totalPages}`, PAGE_MARGIN, footerY, {
      width: doc.page.width - PAGE_MARGIN * 2,
      align: "right",
      lineBreak: false,
    });
}

function drawFirstPageHeading(doc: PdfDocument, data: AccountStatementPdfData) {
  const width = doc.page.width - PAGE_MARGIN * 2;
  doc.roundedRect(PAGE_MARGIN, PAGE_MARGIN, width, 5, 2).fill(COLORS.green);
  doc
    .font("Helvetica-Bold")
    .fontSize(21)
    .fillColor(COLORS.navy)
    .text(data.bankName, PAGE_MARGIN, PAGE_MARGIN + 20, { lineBreak: false });
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor(COLORS.green)
    .text("ACCOUNT STATEMENT", PAGE_MARGIN, PAGE_MARGIN + 50, { lineBreak: false });
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text(`Generated ${displayDate(data.generatedAt)}`, PAGE_MARGIN, PAGE_MARGIN + 70, { lineBreak: false });

  const blockY = PAGE_MARGIN + 98;
  const blockGap = 12;
  const blockWidth = (width - blockGap) / 2;
  const details = [
    {
      x: PAGE_MARGIN,
      label: "CUSTOMER INFORMATION",
      lines: [data.customerName || "Customer", data.customerEmail || ""],
    },
    {
      x: PAGE_MARGIN + blockWidth + blockGap,
      label: "ACCOUNT DETAILS",
      lines: [data.accountNumber, `${data.accountType} · ${data.currency}`],
    },
  ];
  details.forEach((block) => {
    doc.roundedRect(block.x, blockY, blockWidth, 58, 7).fill(COLORS.light);
    doc
      .font("Helvetica-Bold")
      .fontSize(7)
      .fillColor(COLORS.muted)
      .text(block.label, block.x + 10, blockY + 9, { lineBreak: false });
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(COLORS.text)
      .text(block.lines[0], block.x + 10, blockY + 23, {
        width: blockWidth - 20,
        lineBreak: false,
        ellipsis: true,
      });
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(COLORS.muted)
      .text(block.lines[1], block.x + 10, blockY + 39, {
        width: blockWidth - 20,
        lineBreak: false,
        ellipsis: true,
      });
  });

  const periodY = blockY + 69;
  doc.font("Helvetica-Bold").fontSize(7).fillColor(COLORS.muted).text("STATEMENT PERIOD", PAGE_MARGIN, periodY);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.text).text(periodLabel(data.startDate, data.endDate), PAGE_MARGIN, periodY + 12);

  const balanceY = periodY + 34;
  const cardGap = 12;
  const cardWidth = (width - cardGap) / 2;
  [
    { label: "OPENING BALANCE", value: formatBdt(data.openingBalance), color: COLORS.navy },
    { label: "CLOSING BALANCE", value: formatBdt(data.closingBalance), color: COLORS.green },
  ].forEach((card, index) => {
    const x = PAGE_MARGIN + index * (cardWidth + cardGap);
    doc.roundedRect(x, balanceY, cardWidth, 48, 7).fill(card.color);
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#DCE8F2").text(card.label, x + 11, balanceY + 9);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.white).text(card.value, x + 11, balanceY + 23, {
      width: cardWidth - 22,
      lineBreak: false,
      ellipsis: true,
    });
  });

  doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.navy).text("TRANSACTION DETAILS", PAGE_MARGIN, balanceY + 61);
  return drawTableHeader(doc, balanceY + 78);
}

export async function createAccountStatementPdf(data: AccountStatementPdfData) {
  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({
      size: "A4",
      margins: { top: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN },
      bufferPages: true,
      info: {
        Title: "Account Statement",
        Author: data.bankName,
        Subject: `Account statement for ${data.accountNumber}`,
      },
    });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));

    try {
      let y = drawFirstPageHeading(document, data);
      if (data.transactions.length === 0) {
        document
          .font("Helvetica")
          .fontSize(9)
          .fillColor(COLORS.muted)
          .text("No transactions were recorded in this statement period.", PAGE_MARGIN, y + 12, {
            lineBreak: false,
          });
      }
      for (const transaction of data.transactions) {
        const description = transaction.description.trim() || "—";
        const rowHeight = Math.max(
          25,
          document.font("Helvetica").fontSize(7.5).heightOfString(description, {
            width: TABLE_COLUMNS[2].width - 10,
            lineGap: 1,
          }) + 12,
        );
        if (y + rowHeight > document.page.height - PAGE_MARGIN - FOOTER_SPACE) {
          document.addPage();
          y = drawContinuationHeader(document, data);
        }
        y = drawRow(document, transaction, y);
      }

      const pageRange = document.bufferedPageRange();
      for (let index = 0; index < pageRange.count; index += 1) {
        document.switchToPage(pageRange.start + index);
        addPageFooter(document, index + 1, pageRange.count);
      }
      document.end();
    } catch (error) {
      reject(error);
    }
  });
}

export function createStatementFilename(accountNumber: string, startDate: string | null, endDate: string | null) {
  const safeAccount = accountNumber.replace(/[^a-zA-Z0-9_-]/g, "").slice(-20) || "account";
  const safeStart = startDate ?? "all-time";
  const safeEnd = endDate ?? "present";
  return `account-statement-${safeAccount}-${safeStart}-to-${safeEnd}.pdf`;
}
