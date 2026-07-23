/**
 * Formats a positive integer with its English ordinal suffix: 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st, 22nd, ...
 *
 * The 11th/12th/13th exception is why this can't just switch on the last digit — Congress numbers eventually reach the
 * hundreds (the 111th, 112th, and 113th Congresses already have), where a naive last-digit check would wrongly produce
 * "111st", "112nd", "113rd".
 */
export function formatOrdinal(value: number): string {
  const lastTwoDigits: number = value % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) return `${value}th`;

  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}
