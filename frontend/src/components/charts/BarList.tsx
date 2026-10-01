import "./charts.css";

export interface Bar {
  key: string;
  label: string;
  value: number;
  display: string;
  color?: string;
  emphasis?: boolean;
}

interface Props {
  bars: Bar[];
  max?: number;
  caption: string;
  labelWidth?: string;
}

/** Horizontal bars labelled directly: name on the left, value at the bar's end. */
export function BarList({ bars, max, caption, labelWidth = "9.5rem" }: Props) {
  const top = max ?? Math.max(...bars.map((b) => b.value), 0.0001);
  return (
    <figure className="barlist" style={{ ["--label-w" as string]: labelWidth }}>
      <figcaption className="visually-hidden">{caption}</figcaption>
      <ul>
        {bars.map((b) => (
          <li key={b.key} className={b.emphasis ? "is-emphasis" : ""}>
            <span className="barlist__label">{b.label}</span>
            <span className="barlist__track">
              <span
                className="barlist__bar"
                style={{
                  // Leave room for the value label at the end of the longest bar.
                  width: `calc((100% - 4.5rem) * ${Math.max(0, b.value) / top})`,
                  background: b.color ?? "var(--graphite)",
                }}
              />
              <span className="barlist__value num">{b.display}</span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
