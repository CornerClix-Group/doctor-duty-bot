const ENGLISH_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/**
 * Next calendar month from today (full English month name + year).
 * December rolls forward to January of the following year.
 */
export function getNextMonthAndYear(): { month: string; year: number } {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    month: ENGLISH_MONTHS[next.getMonth()],
    year: next.getFullYear(),
  };
}
