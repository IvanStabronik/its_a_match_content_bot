export function parseScheduleInput(input: string, timezone = 'Europe/Warsaw'): Date | null {
  const trimmed = input.trim();

  const ddmmyyyy = /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/;
  const ddmm = /^(\d{2})\.(\d{2})\s+(\d{1,2}):(\d{2})$/;

  const m1 = trimmed.match(ddmmyyyy);
  if (m1) {
    return buildTimezoneDate(
      Number(m1[3]),
      Number(m1[2]),
      Number(m1[1]),
      Number(m1[4]),
      Number(m1[5]),
      timezone,
    );
  }

  const m2 = trimmed.match(ddmm);
  if (m2) {
    const year = new Date().getFullYear();
    return buildTimezoneDate(
      year,
      Number(m2[2]),
      Number(m2[1]),
      Number(m2[3]),
      Number(m2[4]),
      timezone,
    );
  }

  return null;
}

function buildTimezoneDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  let utc = Date.UTC(year, month - 1, day, hour, minute);

  for (let i = 0; i < 48; i++) {
    const d = new Date(utc);
    const parts = formatter.formatToParts(d);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '-1');

    const fDay = get('day');
    const fMonth = get('month');
    const fYear = get('year');
    const fHour = get('hour');
    const fMinute = get('minute');

    if (fYear === year && fMonth === month && fDay === day && fHour === hour && fMinute === minute) {
      return d;
    }

    const diffMinutes =
      (hour - fHour) * 60 +
      (minute - fMinute) +
      (day - fDay) * 24 * 60 +
      (month - fMonth) * 30 * 24 * 60;
    utc += diffMinutes * 60 * 1000;
  }

  return null;
}

export function validateScheduleTime(date: Date): { valid: boolean; error?: string } {
  const now = Date.now();
  const minTime = now + 5 * 60 * 1000;
  const maxTime = now + 30 * 24 * 60 * 60 * 1000;

  if (date.getTime() < now) {
    return { valid: false, error: 'Нельзя запланировать публикацию в прошлом' };
  }
  if (date.getTime() < minTime) {
    return { valid: false, error: 'Время должно быть не ранее чем через 5 минут от текущего момента' };
  }
  if (date.getTime() > maxTime) {
    return { valid: false, error: 'Время не может быть позже чем через 30 дней' };
  }
  return { valid: true };
}

export function formatScheduleConfirm(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function toUtcIso(date: Date): string {
  return date.toISOString();
}

export function formatDateTime(iso: string, timezone: string): string {
  return formatScheduleConfirm(iso, timezone);
}
