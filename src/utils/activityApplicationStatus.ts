export type ApplicationStatusTone = 'open' | 'scheduled' | 'closed';

export type ApplicationStatus = {
  label: string;
  tone: ApplicationStatusTone;
};

const startOfLocalDay = (value: Date) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate());

const parseDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const getApplicationStatus = (
  startValue?: string | null,
  endValue?: string | null,
  now = new Date()
): ApplicationStatus => {
  const today = startOfLocalDay(now);
  const start = parseDate(startValue);
  const end = parseDate(endValue);

  if (start && startOfLocalDay(start).getTime() > today.getTime()) {
    return { label: '예정', tone: 'scheduled' };
  }

  if (end) {
    const endDay = startOfLocalDay(end);
    const remainingDays = Math.round(
      (endDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)
    );

    if (remainingDays < 0) return { label: '마감', tone: 'closed' };
    if (remainingDays === 0) return { label: '접수중 D-Day', tone: 'open' };
    return { label: `접수중 D-${remainingDays}`, tone: 'open' };
  }

  return { label: '접수중', tone: 'open' };
};
