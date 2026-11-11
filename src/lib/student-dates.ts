const timeZone = 'America/Rio_Branco';
export function studentDateKey(value?: string | null) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return 'sem-data';
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
}
export function studentDateLabel(value?: string | null) {
  return studentDateKey(value) === 'sem-data' ? 'Sem data' : new Date(value!).toLocaleDateString('pt-BR', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' });
}
export function groupStudentDates<T>(items: T[], getDate: (item: T) => string | null | undefined, oldest = false, now = new Date()) {
  const groups = new Map<string, T[]>();
  for (const item of items) { const key = studentDateKey(getDate(item)); groups.set(key, [...(groups.get(key) || []), item]); }
  const today = studentDateKey(now.toISOString()), yesterday = studentDateKey(new Date(now.getTime() - 86400000).toISOString());
  return [...groups].sort(([a], [b]) => a === 'sem-data' ? 1 : b === 'sem-data' ? -1 : oldest ? a.localeCompare(b) : b.localeCompare(a)).map(([key, values]) => {
    const date = key === 'sem-data' ? null : new Date(`${key}T12:00:00-05:00`);
    const formatted = date?.toLocaleDateString('pt-BR', { timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return { key, title: key === today ? `Hoje · ${studentDateLabel(date!.toISOString())}` : key === yesterday ? `Ontem · ${studentDateLabel(date!.toISOString())}` : formatted ? formatted.charAt(0).toUpperCase() + formatted.slice(1) : 'Sem data informada', items: values };
  });
}
export function studentMonths(values: (string | null | undefined)[]) {
  return [...new Set(values.map(studentDateKey).filter(key => key !== 'sem-data').map(key => key.slice(0, 7)))].sort().reverse().map(value => ({ value, label: new Date(`${value}-01T12:00:00-05:00`).toLocaleDateString('pt-BR', { timeZone, month: 'long', year: 'numeric' }) }));
}
