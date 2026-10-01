import { describe, expect, it } from "vitest";

import type { ModelId, Reading } from "./api";
import { describeAgreement } from "./outlier";

const order: ModelId[] = ["vader", "nb", "logreg", "mlp"];
const names: Record<ModelId, string> = {
  vader: "VADER",
  nb: "Naive Bayes",
  logreg: "Logistic regression",
  mlp: "Neural net",
};
const r = (label: Reading["label"], score: number): Reading => ({
  label,
  score,
  confidence: 0.6,
  probs: { negative: 0.2, neutral: 0.2, positive: 0.6 },
});

describe("describeAgreement", () => {
  it("names the outlier when three agree", () => {
    const text = describeAgreement(
      { vader: r("positive", 0.7), nb: r("negative", -0.4), logreg: r("negative", -0.8), mlp: r("negative", -0.6) },
      (id) => names[id],
      order,
    );
    expect(text).toBe("VADER is the outlier: it reads positive while the other three read negative.");
  });

  it("describes a two-two split", () => {
    const text = describeAgreement(
      { vader: r("positive", 0.7), nb: r("positive", 0.4), logreg: r("negative", -0.8), mlp: r("negative", -0.6) },
      (id) => names[id],
      order,
    );
    expect(text).toBe(
      "The models split two against two: VADER and Naive Bayes read positive, Logistic regression and Neural net read negative.",
    );
  });

  it("reports the spread when all agree", () => {
    const text = describeAgreement(
      { vader: r("negative", -0.2), nb: r("negative", -0.4), logreg: r("negative", -0.8), mlp: r("negative", -0.6) },
      (id) => names[id],
      order,
    );
    expect(text).toBe("All four read negative. Scores run from −0.80 to −0.20; VADER is the least sure.");
  });

  it("handles a three-way split", () => {
    const text = describeAgreement(
      { vader: r("positive", 0.7), nb: r("neutral", 0.0), logreg: r("negative", -0.8), mlp: r("negative", -0.6) },
      (id) => names[id],
      order,
    );
    expect(text).toBe(
      "No majority: Logistic regression and Neural net read negative, VADER reads positive and Naive Bayes reads neutral.",
    );
  });
});
