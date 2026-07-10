import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { EmployeePayrollView } from '@/components/PayrollEmployeeDetail';
import { POSITION_LABELS } from '@/lib/employee-positions';
import {
  applyPayrollExclusions,
  exclusionsToMap,
  type PayrollReviewLineItem,
} from '@/lib/payroll-line-item-duplicates';

const CALL_REP_LABELS: Record<string, string> = {
  booking: 'Booking',
  show: 'Show',
  live_transfer: 'Live Transfer',
};

const B2B_LABELS: Record<string, string> = {
  qualified_demo: 'Qualified Demo',
  close: 'Close',
};

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'employee';
}

function sectionTitle(section: EmployeePayrollView['section']): string {
  if (section === 'call_rep') return 'Call Rep';
  if (section === 'b2b_setter') return 'B2B Setter';
  return 'Salaried';
}

export function downloadPayrollStatementPdf(view: EmployeePayrollView): void {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const margin = 48;
  let y = margin;
  const exclusions = view.lineItemExclusions ?? [];
  const exclusionMap = exclusionsToMap(exclusions);
  const hasExclusions = exclusions.length > 0;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(30, 41, 59);
  doc.text('Payroll Statement', margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  y += 22;
  doc.text(view.periodLabel, margin, y);
  y += 14;
  doc.text(`${view.startDate} → ${view.endDate}`, margin, y);

  if (hasExclusions) {
    y += 16;
    doc.setTextColor(180, 83, 9);
    doc.text(`${exclusions.length} line item(s) excluded from pay (see line items below).`, margin, y);
  }

  y += 28;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(30, 41, 59);
  doc.text(view.agent_name, margin, y);

  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(sectionTitle(view.section), margin, y);

  const { row, section } = view;
  const adjusted =
    hasExclusions && section !== 'salaried'
      ? applyPayrollExclusions(section, row as import('@/lib/agent-commissions').AgentCommissionRow | import('@/lib/b2b-setter-commissions').B2BSetterCommissionRow, exclusions)
      : null;

  const earningsRows: string[][] = [];

  if (section === 'call_rep') {
    const r = row as import('@/lib/agent-commissions').AgentCommissionRow;
    const counts = (adjusted?.counts ?? r.counts) as typeof r.counts;
    const amounts = (adjusted?.amounts ?? r.amounts) as typeof r.amounts;
    earningsRows.push(
      ['Base salary', fmtMoney(amounts.base)],
      ['Monthly bonus', fmtMoney(amounts.bonus)],
      [`Bookings (${counts.bookings} × $${r.rates.pay_per_booking})`, fmtMoney(amounts.bookings)],
      [`Shows (${counts.shows} × $${r.rates.pay_per_show})`, fmtMoney(amounts.shows)],
      [`Live transfers (${counts.live_transfers} × $${r.rates.pay_per_live_transfer})`, fmtMoney(amounts.live_transfers)],
      [hasExclusions ? 'Adjusted total pay' : 'Total pay', fmtMoney(amounts.total)],
    );
  } else if (section === 'b2b_setter') {
    const r = row as import('@/lib/b2b-setter-commissions').B2BSetterCommissionRow;
    const counts = (adjusted?.counts ?? r.counts) as typeof r.counts;
    const amounts = (adjusted?.amounts ?? r.amounts) as typeof r.amounts;
    earningsRows.push(
      ['Base salary', fmtMoney(amounts.base)],
      ['Monthly bonus', fmtMoney(amounts.bonus)],
      [`Qualified demos (${counts.qualified_demos} × $${r.rates.pay_per_qualified_demo})`, fmtMoney(amounts.qualified_demos)],
      [`Closes (${counts.closes} × $${r.rates.pay_per_close})`, fmtMoney(amounts.closes)],
      [hasExclusions ? 'Adjusted total pay' : 'Total pay', fmtMoney(amounts.total)],
    );
  } else {
    const r = row as import('@/lib/salaried-commissions').SalariedCommissionRow;
    earningsRows.push(
      ['Position', POSITION_LABELS[r.position] ?? r.position],
      ['Base salary', fmtMoney(r.amounts.base)],
      ['Monthly bonus', fmtMoney(r.amounts.bonus)],
      ['Total pay', fmtMoney(r.amounts.total)],
    );
  }

  y += 20;
  autoTable(doc, {
    startY: y,
    head: [['Earnings', 'Amount']],
    body: earningsRows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: [15, 32, 64], textColor: 255 },
    columnStyles: { 1: { halign: 'right' } },
    didParseCell: data => {
      if (data.section === 'body' && data.row.index === earningsRows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = [22, 163, 74];
      }
    },
  });

  const items = ('line_items' in row ? row.line_items : []) as PayrollReviewLineItem[];

  if (items.length > 0) {
    const labels = section === 'b2b_setter' ? B2B_LABELS : CALL_REP_LABELS;
    const showClient = section === 'call_rep';
    const lineRows = items.map(item => {
      const excluded = exclusionMap.has(item.event_id);
      const reason = exclusionMap.get(item.event_id);
      return [
        item.date,
        labels[item.type] ?? item.type,
        item.lead_name ?? '—',
        item.lead_phone ?? '—',
        ...(showClient ? [item.client_name ?? '—'] : []),
        fmtMoney(item.unit_pay),
        excluded ? 'Excluded' : 'Paid',
        excluded ? reason ?? 'Excluded from pay' : '',
      ];
    });

    const lastY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    autoTable(doc, {
      startY: lastY + 24,
      head: [['Date', 'Type', 'Lead', 'Phone', ...(showClient ? ['Client'] : []), 'Pay', 'Status', 'Notes']],
      body: lineRows,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [15, 32, 64], textColor: 255 },
      columnStyles: {
        [lineRows[0].length - 2]: { halign: 'center' },
        [lineRows[0].length - 1]: { fontSize: 7 },
      },
      didParseCell: data => {
        if (data.section !== 'body') return;
        const statusCol = lineRows[0].length - 2;
        if (data.column.index === statusCol && String(data.cell.raw) === 'Excluded') {
          data.cell.styles.textColor = [220, 38, 38];
        }
      },
    });
  }

  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Generated ${new Date().toLocaleString()} · For internal payroll records`,
    margin,
    pageHeight - 28,
  );

  doc.save(`${slugify(view.agent_name)}-payroll-${view.periodMonth}.pdf`);
}
