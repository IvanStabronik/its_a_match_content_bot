import { parseScheduleInput } from './schedule-parser.js';

export interface ScheduleAssignment {
  postId: number;
  slotLabel: string;
  scheduledAt: string;
}

export interface SchedulePreviewResult {
  assignments: ScheduleAssignment[];
  skippedPastSlots: number;
  overflowCount: number;
  useTomorrow: boolean;
  message?: string;
}

export function getDatePartsInTimezone(date: Date, timezone: string): {
  year: number;
  month: number;
  day: number;
} {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [year, month, day] = formatter.format(date).split('-').map(Number);
  return { year, month, day };
}

export function formatPackDate(date: Date, timezone: string): string {
  const { year, month, day } = getDatePartsInTimezone(date, timezone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatPackDateDisplay(packDate: string): string {
  const [y, m, d] = packDate.split('-');
  return `${d}.${m}.${y?.slice(2) ?? ''}`;
}

function slotToDate(
  slot: string,
  dayOffset: number,
  timezone: string,
  reference: Date,
): Date | null {
  const ref = new Date(reference.getTime() + dayOffset * 24 * 60 * 60 * 1000);
  const { year, month, day } = getDatePartsInTimezone(ref, timezone);
  const dd = String(day).padStart(2, '0');
  const mm = String(month).padStart(2, '0');
  return parseScheduleInput(`${dd}.${mm}.${year} ${slot}`, timezone);
}

function generateExtraSlots(count: number, baseSlots: string[]): string[] {
  if (count <= 0) return [];
  const last = baseSlots[baseSlots.length - 1] ?? '21:00';
  const [lh, lm] = last.split(':').map(Number);
  const startMinutes = lh * 60 + lm + 30;
  const endMinutes = 22 * 60;
  const step = Math.max(30, Math.floor((endMinutes - startMinutes) / (count + 1)));
  const extra: string[] = [];
  for (let i = 1; i <= count; i++) {
    const mins = startMinutes + step * i;
    if (mins >= endMinutes) break;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    extra.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
  while (extra.length < count) {
    extra.push(`${String(22 - extra.length).padStart(2, '0')}:00`);
  }
  return extra.slice(0, count);
}

export function buildDailySchedulePreview(
  postIds: number[],
  slots: string[],
  timezone: string,
  referenceDate: Date = new Date(),
): SchedulePreviewResult {
  if (postIds.length === 0) {
    return { assignments: [], skippedPastSlots: 0, overflowCount: 0, useTomorrow: false };
  }

  const now = referenceDate.getTime();
  let dayOffset = 0;
  let allSlots = [...slots];
  let skippedPast = 0;

  const tryAssign = (offset: number, slotList: string[]) => {
    const futureSlots: string[] = [];
    for (const slot of slotList) {
      const dt = slotToDate(slot, offset, timezone, referenceDate);
      if (dt && dt.getTime() > now + 5 * 60 * 1000) {
        futureSlots.push(slot);
      } else if (offset === 0) {
        skippedPast++;
      }
    }
    return futureSlots;
  };

  let futureSlots = tryAssign(0, allSlots);
  if (futureSlots.length === 0) {
    dayOffset = 1;
    futureSlots = tryAssign(1, allSlots);
    skippedPast = slots.length;
  }

  let overflow = 0;
  if (postIds.length > futureSlots.length) {
    overflow = postIds.length - futureSlots.length;
    const extra = generateExtraSlots(overflow, slots);
    for (const slot of extra) {
      const dt = slotToDate(slot, dayOffset, timezone, referenceDate);
      if (dt && dt.getTime() > now + 5 * 60 * 1000) {
        futureSlots.push(slot);
      }
    }
    if (postIds.length > futureSlots.length) {
      overflow = postIds.length - futureSlots.length;
    } else {
      overflow = 0;
    }
  }

  const assignments: ScheduleAssignment[] = [];
  for (let i = 0; i < postIds.length && i < futureSlots.length; i++) {
    const slot = futureSlots[i]!;
    const dt = slotToDate(slot, dayOffset, timezone, referenceDate);
    if (!dt) continue;
    assignments.push({
      postId: postIds[i]!,
      slotLabel: slot,
      scheduledAt: dt.toISOString(),
    });
  }

  const useTomorrow = dayOffset === 1;
  let message: string | undefined;
  if (assignments.length < postIds.length) {
    message = 'Не хватает слотов на сегодня. Выберите меньше постов или подтвердите расписание на завтра.';
  }

  return {
    assignments,
    skippedPastSlots: skippedPast,
    overflowCount: Math.max(0, postIds.length - assignments.length),
    useTomorrow,
    message,
  };
}

export function isPastDailyPackTime(
  packTime: string,
  timezone: string,
  referenceDate: Date = new Date(),
): boolean {
  const dt = slotToDate(packTime, 0, timezone, referenceDate);
  if (!dt) return false;
  return referenceDate.getTime() >= dt.getTime();
}

export function packTimeMatchesMinute(
  packTime: string,
  timezone: string,
  referenceDate: Date = new Date(),
): boolean {
  const [ph, pm] = packTime.split(':').map(Number);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(referenceDate);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? -1);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? -1);
  return hour === ph && minute === pm;
}
