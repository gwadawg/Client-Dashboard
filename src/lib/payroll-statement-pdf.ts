import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { EmployeePayrollView } from '@/components/PayrollEmployeeDetail';
import { POSITION_LABELS } from '@/lib/employee-positions';

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
  const earningsRows: string[][] = [];

  if (section === 'call_rep') {
    const r = row as import('@/lib/agent-commissions').AgentCommissionRow;
    earningsRows.push(
      ['Base salary', fmtMoney(r.amounts.base)],
      ['Monthly bonus', fmtMoney(r.amounts.bonus)],
      [`Bookings (${r.counts.bookings} × $${r.rates.pay_per_booking})`, fmtMoney(r.amounts.bookings)],
      [`Shows (${r.counts.shows} × $${r.rates.pay_per_show})`, fmtMoney(r.amounts.shows)],
      [`Live transfers (${r.counts.live_transfers} × $${r.rates.pay_per_live_transfer})`, fmtMoney(r.amounts.live_transfers)],
      ['Total pay', fmtMoney(r.amounts.total)],
    );
  } else if (section === 'b2b_setter') {
    const r = row as import('@/lib/b2b-setter-commissions').B2BSetterCommissionRow;
    earningsRows.push(
      ['Base salary', fmtMoney(r.amounts.base)],
      ['Monthly bonus', fmtMoney(r.amounts.bonus)],
      [`Qualified demos (${r.counts.qualified_demos} × $${r.rates.pay_per_qualified_demo})`, fmtMoney(r.amounts.qualified_demos)],
      [`Closes (${r.counts.closes} × $${r.rates.pay_per_close})`, fmtMoney(r.amounts.closes)],
      ['Total pay', fmtMoney(r.amounts.total)],
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

  const items = ('line_items' in row ? row.line_items : []) as {
    date: string;
    type: string;
    lead_name: string | null;
    lead_phone: string | null;
    client_name?: string;
    unit_pay: number;
  }[];

  if (items.length > 0) {
    const labels = section === 'b2b_setter' ? B2B_LABELS : CALL_REP_LABELS;
    const showClient = section === 'call_rep';
    const lineRows = items.map(item => [
      item.date,
      labels[item.type] ?? item.type,
      item.lead_name ?? '—',
      item.lead_phone ?? '—',
      ...(showClient ? [item.client_name ?? '—'] : []),
      fmtMoney(item.unit_pay),
    ]);

    const lastY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    autoTable(doc, {
      startY: lastY + 24,
      head: [['Date', 'Type', 'Lead', 'Phone', ...(showClient ? ['Client'] : []), 'Pay']],
      body: lineRows,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [15, 32, 64], textColor: 255 },
      columnStyles: { [lineRows[0].length - 1]: { halign: 'right' } },
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

  const periodSlug = view.periodMonth;
  doc.save(`${slugify(view.agent_name)}-payroll-${periodSlug}.pdf`);
}
