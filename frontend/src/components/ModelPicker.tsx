import { useId } from "react";

import { MODEL_IDS, type ModelId } from "../lib/api";
import { useMediaQuery } from "../lib/motion";
import { useApp } from "../lib/store";

interface Props {
  value: ModelId;
  onChange: (m: ModelId) => void;
  legend?: string;
}

/** Four real radio buttons styled as a quiet segmented control. */
export function ModelPicker({ value, onChange, legend = "Read with" }: Props) {
  const { modelName } = useApp();
  const name = useId();
  const compact = useMediaQuery("(max-width: 719px)");
  if (compact) {
    return (
      <div className="picker-select">
        <label htmlFor={name}>{legend}</label>
        <select id={name} className="select" value={value} onChange={(e) => onChange(e.target.value as ModelId)}>
          {MODEL_IDS.map((id) => (
            <option key={id} value={id}>
              {modelName(id)}
            </option>
          ))}
        </select>
      </div>
    );
  }
  return (
    <fieldset className="segmented">
      <legend>{legend}</legend>
      {MODEL_IDS.map((id) => (
        <span key={id}>
          <input
            type="radio"
            id={`${name}-${id}`}
            name={name}
            value={id}
            checked={value === id}
            onChange={() => onChange(id)}
          />
          <label htmlFor={`${name}-${id}`}>{modelName(id)}</label>
        </span>
      ))}
    </fieldset>
  );
}
