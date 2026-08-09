export const INCOME_BANDS = [
  { value: "low", label: "Low income" },
  { value: "lower_middle", label: "Lower middle" },
  { value: "middle", label: "Middle" },
  { value: "upper_middle", label: "Upper middle" },
  { value: "high", label: "High income" },
] as const;

export function incomeBandLabel(value: string): string {
  return INCOME_BANDS.find((b) => b.value === value)?.label ?? value;
}
