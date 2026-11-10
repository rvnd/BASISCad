import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { PrintBudget } from '../app/printBudget';
import { COST_PER_HOLE_USD } from '../app/constants';
import type { PrintSnapshot, PrintView } from '../three/printSnapshot';
import { PRINT_VIEWS } from '../app/printViews';
import Brand from './Brand';
interface PrintReportProps {
  name: string;
  date: string;
  view: PrintView;
  snapshot: PrintSnapshot;
  budget: PrintBudget;
  onClose: () => void;
  onChangeView: () => void;
}
export default function PrintReport(props: PrintReportProps) {
  const { onClose } = props;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const { snapshot, budget } = props,
    money = (amount: number) => `$${amount.toFixed(2)}`;
  const line = (a: { x: number; y: number }, b: { x: number; y: number }, key: string) => (
    <line key={key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#333" strokeWidth=".8" />
  );
  return createPortal(
    <div className="print-shell" role="dialog" aria-modal="true" aria-label="Print preview">
      <div className="print-controls">
        <strong>Print preview · 2 pages</strong>
        <button type="button" onClick={props.onChangeView}>
          Change view
        </button>
        <button type="button" onClick={() => window.print()}>
          Print
        </button>
        <button type="button" onClick={props.onClose}>
          Close preview
        </button>
      </div>
      <div className="print-scroll">
        <div className="print-report">
          <section className="print-page" aria-label="Design page">
            <Brand />
            <h1>{props.name}</h1>
            <p className="print-meta">
              {props.date} · {PRINT_VIEWS.find((view) => view.id === props.view)!.name} view
            </p>
            <p className="print-meta">
              Overall size: X {snapshot.size.x.toFixed(1)} × Y {snapshot.size.y.toFixed(1)} × Z{' '}
              {snapshot.size.z.toFixed(1)} mm
            </p>
            <svg
              className="print-drawing"
              viewBox={`0 0 ${snapshot.width} ${snapshot.height}`}
              role="img"
              aria-label="Design with black outlines and blueprint labels"
            >
              <image href={snapshot.image} width={snapshot.width} height={snapshot.height} />
              <defs>
                <marker
                  id="print-dimension-arrow"
                  viewBox="0 0 8 8"
                  refX="4"
                  refY="4"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M0 0L8 4L0 8z" fill="#333" />
                </marker>
              </defs>
              {snapshot.labels.map((label) => (
                <g key={label.id}>
                  {label.dimensions.length ? (
                    label.dimensions.map((d, i) => (
                      <g key={i}>
                        {line(d.fromStart, d.start, 'a')}
                        {line(d.fromEnd, d.end, 'b')}
                        <line
                          x1={d.start.x}
                          y1={d.start.y}
                          x2={d.end.x}
                          y2={d.end.y}
                          stroke="#333"
                          strokeWidth=".8"
                          markerStart="url(#print-dimension-arrow)"
                          markerEnd="url(#print-dimension-arrow)"
                        />
                        {line(
                          { x: (d.start.x + d.end.x) / 2, y: (d.start.y + d.end.y) / 2 },
                          d.textAt,
                          'leader',
                        )}
                        <rect
                          x={d.textAt.x - d.text.length * 3.5 - 3}
                          y={d.textAt.y - 8}
                          width={d.text.length * 7 + 6}
                          height="16"
                          fill="white"
                        />
                        <text
                          x={d.textAt.x}
                          y={d.textAt.y + 4}
                          textAnchor="middle"
                          fontSize="12"
                          fill="#111"
                        >
                          {d.text}
                        </text>
                      </g>
                    ))
                  ) : (
                    <>
                      {line(label.anchor, label.position, 'name')}
                      <rect
                        x={label.position.x}
                        y={label.position.y - 12}
                        width={label.name.length * 7 + 8}
                        height="18"
                        fill="white"
                      />
                      <text
                        x={label.position.x + 4}
                        y={label.position.y + 1}
                        fontSize="14"
                        fill="#111"
                      >
                        {label.name}
                      </text>
                    </>
                  )}
                </g>
              ))}
            </svg>
            <footer>Design · 1 / 2</footer>
          </section>
          <section className="print-page budget-page" aria-label="Budget page">
            <Brand />
            <h1>Materials and budget</h1>
            <p className="print-meta">
              {props.name} · {props.date}
            </p>
            <div className="print-budget-columns">
              <section>
                <h2>Materials Needed</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {budget.rows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        <td>{row.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p>
                  <strong>Total pieces: {budget.pieces}</strong>
                </p>
                {budget.fasteners > 0 && <p>Screw/nut pairs: {budget.fasteners}</p>}
              </section>
              <section>
                <h2>Materials Cost</h2>
                <p className="print-price-note">${COST_PER_HOLE_USD} per hole</p>
                <table>
                  <thead>
                    <tr>
                      <th>Piece</th>
                      <th>Qty</th>
                      <th>Holes each</th>
                      <th>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {budget.rows
                      .filter((row) => !row.hardware)
                      .map((row) => (
                        <tr key={row.id}>
                          <td>{row.name}</td>
                          <td>{row.quantity}</td>
                          <td>{row.holes ?? '?'}</td>
                          <td>{row.cost === null ? 'Unknown' : money(row.cost)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                <p>
                  <strong>
                    {budget.unknownCosts ? 'Known subtotal' : 'Total cost'}: {money(budget.cost)}
                  </strong>
                </p>
                {budget.unknownCosts > 0 && (
                  <p>Imported pieces with unknown hole counts are unpriced.</p>
                )}
                {budget.fasteners > 0 && (
                  <p className="print-price-note">
                    Hardware is listed separately; its price is not specified.
                  </p>
                )}
              </section>
            </div>
            <section className="print-evaluation">
              <h2>Evaluation</h2>
              <div aria-label="Blank evaluation space" />
            </section>
            <footer>Budget · 2 / 2</footer>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
