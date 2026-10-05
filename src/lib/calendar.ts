import { google, type calendar_v3 } from "googleapis"
import { getAuthedGmailClient, createOAuth2Client } from "./gmail-client"
import { db } from "@/server/db"

/**
 * Get an authenticated Google Calendar client for the given account.
 * Re-uses the same OAuth2 credentials as Gmail.
 */
async function getCalendarClient(accountId: string): Promise<calendar_v3.Calendar> {
  // Ensure tokens are fresh by calling the gmail client getter
  await getAuthedGmailClient(accountId)
  
  const account = await db.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { accessToken: true, refreshToken: true, tokenExpiresAt: true },
  })

  const oauth2Client = createOAuth2Client()

  oauth2Client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken ?? undefined,
    expiry_date: account.tokenExpiresAt?.getTime(),
  })

  return google.calendar({ version: "v3", auth: oauth2Client })
}

export interface CalendarEvent {
  id: string
  summary: string
  description?: string
  start: string  // ISO datetime
  end: string    // ISO datetime
  attendees: string[]
  location?: string
  status: string
}

/**
 * Fetch calendar events within a given time range.
 * 
 * @param accountId - The user's account ID
 * @param timeMin - Start of the time range (ISO string)
 * @param timeMax - End of the time range (ISO string)
 * @returns Array of calendar events
 */
export async function getCalendarEvents(
  accountId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<CalendarEvent[]> {
  const calendar = await getCalendarClient(accountId)

  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 20,
  })

  const events = response.data.items ?? []

  return events.map((event) => ({
    id: event.id ?? "",
    summary: event.summary ?? "(No title)",
    description: event.description ?? undefined,
    start: event.start?.dateTime ?? event.start?.date ?? "",
    end: event.end?.dateTime ?? event.end?.date ?? "",
    attendees: (event.attendees ?? []).map((a) => a.email ?? "").filter(Boolean),
    location: event.location ?? undefined,
    status: event.status ?? "confirmed",
  }))
}

/**
 * Check the user's availability (free/busy) for a specific time range.
 */
export async function checkAvailability(
  accountId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<{ busy: boolean; busyPeriods: { start: string; end: string }[] }> {
  const calendar = await getCalendarClient(accountId)

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: "primary" }],
    },
  })

  const busyPeriods = response.data.calendars?.primary?.busy ?? []

  return {
    busy: busyPeriods.length > 0,
    busyPeriods: busyPeriods.map((p) => ({
      start: p.start ?? "",
      end: p.end ?? "",
    })),
  }
}
