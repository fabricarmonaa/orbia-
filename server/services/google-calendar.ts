import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { userGoogleConnections, agendaEvents } from "@shared/schema";
import {
  decryptGoogleToken,
  refreshGoogleAccessToken,
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
} from "./google-oauth";

/**
 * Drizzle Connection fetch helper
 */
export async function getActiveConnection(userId: number, tenantId: number) {
  const [conn] = await db.select().from(userGoogleConnections).where(and(
    eq(userGoogleConnections.userId, userId),
    eq(userGoogleConnections.tenantId, tenantId),
    eq(userGoogleConnections.isActive, true),
  )).limit(1);
  return conn;
}

/**
 * Ensures the Google access token for a given connection is valid and not expired.
 * Refreshes it if necessary.
 */
export async function getValidAccessToken(connectionId: number): Promise<string | null> {
  const [conn] = await db.select().from(userGoogleConnections).where(eq(userGoogleConnections.id, connectionId));
  if (!conn || !conn.isActive) return null;

  const accessToken = decryptGoogleToken(conn.encryptedAccessToken);
  const refreshToken = decryptGoogleToken(conn.encryptedRefreshToken);
  
  if (!accessToken && !refreshToken) return null;

  // Check if token is expired or about to expire (within 5 minutes)
  const isExpired = !conn.accessTokenExpiresAt || conn.accessTokenExpiresAt.getTime() < Date.now() + 300000;

  if (!isExpired && accessToken) {
    return accessToken;
  }

  // Needs refresh
  if (!refreshToken) return null; // Can't refresh without refresh token

  try {
    const refreshed = await refreshGoogleAccessToken(refreshToken);
    const newExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000);
    // Update the tokens in DB (without re-encrypting the refresh token unless necessary, but we only have update accessToken utility here usually. Wait, in google-oauth we have encrypt/decrypt. So we can just update it)
    await db.update(userGoogleConnections).set({
      encryptedAccessToken: require('./google-oauth').encryptGoogleToken(refreshed.accessToken),
      accessTokenExpiresAt: newExpiresAt,
      updatedAt: new Date(),
    }).where(eq(userGoogleConnections.id, conn.id));
    return refreshed.accessToken;
  } catch (error) {
    console.error(`[Google Calendar] Failed to refresh token for connection ${conn.id}:`, error);
    // If refresh fails due to revoked grant, we should mark isActive = false
    await db.update(userGoogleConnections).set({ isActive: false, updatedAt: new Date() }).where(eq(userGoogleConnections.id, conn.id));
    return null;
  }
}

/**
 * Synchronizes a successfully saved Orbia Agenda Event into Google Calendar.
 * Returns true if successful, false if errors occurred but did not crash Orbia.
 */
export async function syncEventToGoogle(
  tenantId: number, 
  userId: number, 
  eventId: number
): Promise<boolean> {
  try {
    const [event] = await db.select().from(agendaEvents).where(and(eq(agendaEvents.id, eventId), eq(agendaEvents.tenantId, tenantId)));
    if (!event || !event.googleSyncEnabled) return true; // Nothing to sync

    // Find the user's active Google connection
    const [conn] = await db.select().from(userGoogleConnections).where(and(
      eq(userGoogleConnections.tenantId, tenantId),
      eq(userGoogleConnections.userId, userId),
      eq(userGoogleConnections.isActive, true)
    ));
    
    if (!conn) return false; // No connection active

    const calendarId = conn.selectedCalendarId || "primary";
    const accessToken = await getValidAccessToken(conn.id);
    if (!accessToken) return false;

    const payload = {
      title: event.title,
      description: event.description || "",
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt ? event.endsAt.toISOString() : undefined,
      allDay: event.allDay,
    };

    if (event.googleEventId) {
      // Update existing
      try {
        await updateGoogleCalendarEvent(accessToken, calendarId, event.googleEventId, payload);
        return true;
      } catch (err: any) {
        // If 404 Not Found, it means the user deleted it in Google. We should recreate it.
        if (err.status === 404 || err.message?.includes("Not Found")) {
          // Fallthrough to creation
        } else {
          throw err;
        }
      }
    }

    // Create new
    const created = await createGoogleCalendarEvent(accessToken, calendarId, payload);
    
    // Update local event to bind it to the brand new remote google event id
    await db.update(agendaEvents)
      .set({ googleEventId: created.id })
      .where(eq(agendaEvents.id, event.id));
    
    return true;
  } catch (error) {
    console.error(`[Google Calendar] Failed to sync event ${eventId}:`, error);
    return false; // Fail gracefully so Orbia doesn't crash
  }
}

/**
 * Given a google event ID, attempts to delete it from the user's remote calendar.
 */
export async function deleteEventFromGoogle(tenantId: number, userId: number, googleEventId?: string | null): Promise<boolean> {
  if (!googleEventId) return true;

  try {
    const [conn] = await db.select().from(userGoogleConnections).where(and(
      eq(userGoogleConnections.tenantId, tenantId),
      eq(userGoogleConnections.userId, userId),
      eq(userGoogleConnections.isActive, true)
    ));
    
    if (!conn) return false;

    const calendarId = conn.selectedCalendarId || "primary";
    const accessToken = await getValidAccessToken(conn.id);
    if (!accessToken) return false;

    await deleteGoogleCalendarEvent(accessToken, calendarId, googleEventId);
    return true;
  } catch (error: any) {
    if (error.status === 404) return true; // Already deleted
    console.error(`[Google Calendar] Failed to delete event ${googleEventId}:`, error);
    return false;
  }
}
