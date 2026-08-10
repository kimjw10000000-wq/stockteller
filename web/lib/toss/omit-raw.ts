/** Strip `raw` (and optionally other debug fields) for public API JSON. */
export function omitRaw<T extends { raw?: unknown }>(
  row: T
): Omit<T, "raw"> {
  const { raw: _ignored, ...rest } = row;
  void _ignored;
  return rest;
}

export function omitRawList<T extends { raw?: unknown }>(rows: T[]): Array<Omit<T, "raw">> {
  return rows.map(omitRaw);
}
