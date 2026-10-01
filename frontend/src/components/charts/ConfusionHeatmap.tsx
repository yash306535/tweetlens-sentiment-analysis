import { heatColor, heatTextColor } from "../../lib/color";
import { formatCount, formatPercent } from "../../lib/format";
import { useTheme } from "../../lib/theme";

interface Props {
  title: string;
  matrix: number[][];
  labels?: string[];
}

const DEFAULT_LABELS = ["negative", "neutral", "positive"];

/** Rows are the true label, columns the reading. Shade is the share of the row; the number is the count. */
export function ConfusionHeatmap({ title, matrix, labels = DEFAULT_LABELS }: Props) {
  const { theme } = useTheme();
  const text = heatTextColor(theme);
  return (
    <table className="heat">
      <caption>{title}</caption>
      <thead>
        <tr>
          <td />
          {labels.map((l) => (
            <th key={l} scope="col" className="heat__col">
              <span className="visually-hidden">read as </span>
              {short(l)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {matrix.map((row, i) => {
          const total = row.reduce((a, b) => a + b, 0) || 1;
          return (
            <tr key={labels[i]}>
              <th scope="row" className="heat__row">
                <span className="visually-hidden">truly </span>
                {short(labels[i])}
              </th>
              {row.map((n, j) => {
                const share = n / total;
                return (
                  <td
                    key={j}
                    className={`heat__cell num ${i === j ? "is-diagonal" : ""}`}
                    style={{ background: heatColor(share, theme), color: text }}
                    title={`${formatCount(n)} ${labels[i]} tweets read as ${labels[j]} (${formatPercent(share)} of the row)`}
                  >
                    {formatCount(n)}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function short(label: string): string {
  return label === "negative" ? "neg" : label === "neutral" ? "neu" : label === "positive" ? "pos" : label;
}
