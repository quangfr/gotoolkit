export const TABLE_COLUMN_DEFAULT_WIDTH = 120;
export const TABLE_COLUMN_MIN_WIDTH = 60;
export const TABLE_COLUMN_MAX_WIDTH = 600;
export const TABLE_COLUMN_AUTO_MAX_WIDTH = 450;

export const clampTableColumnWidth = (
  value: number,
  min = TABLE_COLUMN_MIN_WIDTH,
  max = TABLE_COLUMN_MAX_WIDTH
) => {
  return Math.min(max, Math.max(min, value));
};
