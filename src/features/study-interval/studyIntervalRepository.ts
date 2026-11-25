import { database, type StudyDaySnapshotRecord, type WeeklyStudyScheduleRecord } from "../../database";
import { supabase } from "../../supabase";
import {
  getLocalDateKey,
  getWeekday,
  validateStudyIntervals,
  type WeeklyStudySchedule,
  type Weekday,
} from "./studyInterval";

export type StudyScheduleSyncStatus = "synced" | "offline" | "not-configured";

function currentTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
}

export function isWeeklyStudySchedule(value: unknown): value is WeeklyStudySchedule {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  for (let weekday = 0; weekday < 7; weekday += 1) {
    const day = candidate[weekday] as
      | { off?: unknown; intervals?: unknown }
      | undefined;
    if (
      !day ||
      typeof day.off !== "boolean" ||
      !Array.isArray(day.intervals)
    ) {
      return false;
    }
    if (day.off && day.intervals.length > 0) return false;
    if (!day.off && day.intervals.length === 0) return false;
    if (
      day.intervals.some(
        (interval) =>
          !interval ||
          typeof interval !== "object" ||
          typeof (interval as { id?: unknown }).id !== "string" ||
          typeof (interval as { start?: unknown }).start !== "string" ||
          typeof (interval as { end?: unknown }).end !== "string",
      )
    ) {
      return false;
    }
    if (validateStudyIntervals(day.intervals as WeeklyStudySchedule[Weekday]["intervals"]).length > 0) {
      return false;
    }
  }
  return true;
}

export function validateWeeklyStudySchedule(schedule: WeeklyStudySchedule): string[] {
  const errors: string[] = [];
  for (let weekday = 0; weekday < 7; weekday += 1) {
    const day = schedule[weekday as Weekday];
    if (day.off && day.intervals.length > 0) {
      errors.push(`Day ${weekday}: OFF days cannot contain intervals.`);
    } else if (!day.off && day.intervals.length === 0) {
      errors.push(`Day ${weekday}: add an interval or mark the day OFF.`);
    }
    errors.push(
      ...validateStudyIntervals(day.intervals).map(
        (error) => `Day ${weekday}: ${error}`,
      ),
    );
  }
  return errors;
}

export async function getWeeklyStudySchedule(
  userId: string,
): Promise<WeeklyStudyScheduleRecord | undefined> {
  return database.weeklySchedules.get(userId);
}

/**
 * Saves the recurring schedule locally first. Existing daily snapshots are
 * intentionally not changed: an edit made during a day takes effect tomorrow.
 */
export async function saveWeeklyStudySchedule(
  userId: string,
  schedule: WeeklyStudySchedule,
  timezone = currentTimezone(),
  now = new Date(),
): Promise<WeeklyStudyScheduleRecord> {
  if (!userId.trim()) throw new Error("A signed-in account is required.");
  const errors = validateWeeklyStudySchedule(schedule);
  if (errors.length > 0) throw new Error(errors.join("\n"));

  const record: WeeklyStudyScheduleRecord = {
    id: userId,
    ownerUserId: userId,
    schedule: structuredClone(schedule),
    timezone,
    updatedAt: now.toISOString(),
    syncStatus: "pending",
  };
  await database.weeklySchedules.put(record);
  return record;
}

/**
 * Captures a single immutable schedule snapshot for the current local date.
 * The first successful capture wins for the rest of that calendar day.
 */
export async function getOrCreateStudyDaySnapshot(
  userId: string,
  now = new Date(),
): Promise<StudyDaySnapshotRecord | null> {
  if (!userId.trim()) return null;
  const dateKey = getLocalDateKey(now);
  const id = `${userId}:${dateKey}`;

  return database.transaction("rw", database.studyDaySnapshots, database.weeklySchedules, async () => {
    const existing = await database.studyDaySnapshots.get(id);
    if (existing) return existing;

    const weekly = await database.weeklySchedules.get(userId);
    if (!weekly || weekly.ownerUserId !== userId) return null;

    const weekday = getWeekday(now);
    const daySchedule = weekly.schedule[weekday];
    const snapshot: StudyDaySnapshotRecord = {
      id,
      ownerUserId: userId,
      dateKey,
      weekday,
      schedule: structuredClone(daySchedule),
      timezone: weekly.timezone || currentTimezone(),
      capturedAt: now.toISOString(),
    };
    await database.studyDaySnapshots.add(snapshot);
    return snapshot;
  });
}

/**
 * Reconciles the signed-in account's recurring schedule with Supabase.
 * A newer local edit wins; otherwise the cloud version is cached locally.
 * Network/schema errors leave the local record untouched for a later retry.
 */
export async function syncStudySchedule(
  userId: string,
): Promise<{ status: StudyScheduleSyncStatus; schedule: WeeklyStudySchedule | null }> {
  const local = await database.weeklySchedules.get(userId);
  if (!supabase) {
    return {
      status: local ? "offline" : "not-configured",
      schedule: local?.schedule ?? null,
    };
  }

  try {
    const { data, error } = await supabase
      .from("weekly_study_schedules")
      .select("user_id,schedule,timezone,updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;

    const cloudSchedule = data && isWeeklyStudySchedule(data.schedule)
      ? {
          id: userId,
          ownerUserId: userId,
          schedule: data.schedule,
          timezone: data.timezone || currentTimezone(),
          updatedAt: data.updated_at,
          syncStatus: "synced" as const,
        }
      : undefined;

    if (cloudSchedule && (
      !local || Date.parse(cloudSchedule.updatedAt) >= Date.parse(local.updatedAt)
    )) {
      await database.weeklySchedules.put(cloudSchedule);
      return { status: "synced", schedule: cloudSchedule.schedule };
    }

    if (local) {
      const { error: writeError } = await supabase
        .from("weekly_study_schedules")
        .upsert(
          {
            user_id: userId,
            schedule: local.schedule,
            timezone: local.timezone,
            updated_at: local.updatedAt,
          },
          { onConflict: "user_id" },
        );
      if (writeError) throw writeError;
      const synced = { ...local, syncStatus: "synced" as const };
      await database.weeklySchedules.put(synced);
      return { status: "synced", schedule: synced.schedule };
    }

    return { status: "not-configured", schedule: null };
  } catch {
    return {
      status: local ? "offline" : "not-configured",
      schedule: local?.schedule ?? null,
    };
  }
}
