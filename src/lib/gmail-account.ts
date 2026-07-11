import { simpleParser } from "mailparser";
import crypto from "crypto";
import type { gmail_v1 } from "googleapis";
import { getAuthedGmailClient } from "./gmail-client";
import type {
  EmailMessage,
  EmailAddress,
  EmailAttachment,
  EmailHeader,
} from "./types";

// ─── Error Classes ────────────────────────────────────────────────────────────

/** Thrown when a Gmail API sync operation fails. */
export class GmailSyncError extends Error {
  constructor(
    message: string,
    public readonly accountId: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "GmailSyncError";
  }
}

// ─── Label / Category Mappings ────────────────────────────────────────────────

type SysLabel =
  | "junk"
  | "trash"
  | "sent"
  | "inbox"
  | "unread"
  | "flagged"
  | "important"
  | "draft";

type SysClassification =
  | "personal"
  | "social"
  | "promotions"
  | "updates"
  | "forums";

/** Maps Gmail system label IDs to our canonical sysLabels. */
const LABEL_MAP: Record<string, SysLabel> = {
  INBOX: "inbox",
  SENT: "sent",
  DRAFT: "draft",
  TRASH: "trash",
  SPAM: "junk",
  UNREAD: "unread",
  STARRED: "flagged",
  IMPORTANT: "important",
};

/** Maps Gmail category label IDs to our canonical sysClassifications. */
const CATEGORY_MAP: Record<string, SysClassification> = {
  CATEGORY_PERSONAL: "personal",
  CATEGORY_SOCIAL: "social",
  CATEGORY_PROMOTIONS: "promotions",
  CATEGORY_UPDATES: "updates",
  CATEGORY_FORUMS: "forums",
};

/** Headers worth preserving in `internetHeaders`. */
const USEFUL_HEADERS = new Set([
  "from",
  "to",
  "subject",
  "date",
  "message-id",
  "in-reply-to",
  "references",
  "content-type",
]);

/** Minimum delay (ms) between individual message fetches to respect rate limits. */
const RATE_LIMIT_DELAY_MS = 50;

// ─── GmailAccount Class ──────────────────────────────────────────────────────

/**
 * Gmail sync engine that fetches emails via the native Gmail API, parses raw
 * MIME with `mailparser`, and produces `EmailMessage` objects compatible with
 * `sync-to-db.ts`.
 *
 * Replaces the old Aurinko-based `Account` class.
 *
 * @example
 * ```ts
 * const gmail = new GmailAccount(accountId);
 * const { emails, historyId } = await gmail.fetchEmails(7);
 * await syncEmailsToDatabase(emails, accountId);
 * ```
 */
export class GmailAccount {
  private client: gmail_v1.Gmail | null = null;

  constructor(private readonly accountId: string) {}

  // ── Internal Helpers ──────────────────────────────────────────────────────

  /**
   * Returns a cached, authenticated Gmail API client.
   * The client is created lazily on first call.
   */
  private async getClient(): Promise<gmail_v1.Gmail> {
    if (!this.client) {
      this.client = await getAuthedGmailClient(this.accountId);
    }
    return this.client;
  }

  /** Simple delay helper for rate limiting. */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Performs a full email fetch — either for the last N days or all history.
   *
   * 1. Lists all matching message IDs (paginating through all pages).
   * 2. Fetches each message in raw MIME format (with rate limiting).
   * 3. Parses MIME and maps to `EmailMessage`.
   * 4. Retrieves the current `historyId` for future incremental syncs.
   *
   * @param daysWithin - If provided, only fetch emails from the last N days.
   *                     Omit to fetch all emails.
   * @returns An object containing the parsed emails and the current historyId.
   */
  async fetchEmails(
    daysWithin?: number,
  ): Promise<{ emails: EmailMessage[]; historyId: string }> {
    const gmail = await this.getClient();

    // Build the search query
    const q = daysWithin ? `newer_than:${daysWithin}d` : undefined;

    // Step 1: Collect all message IDs by paginating through list results
    const messageIds = await this.listAllMessageIds(gmail, q);
    console.log(
      `[GmailAccount] Listed ${messageIds.length} message IDs for account ${this.accountId}` +
        (q ? ` (query: ${q})` : " (all history)"),
    );

    // Step 2: Fetch and parse each message
    const emails = await this.fetchAndParseMessages(gmail, messageIds);
    console.log(
      `[GmailAccount] Successfully parsed ${emails.length}/${messageIds.length} messages`,
    );

    // Step 3: Get current historyId for future incremental syncs
    const profile = await gmail.users.getProfile({ userId: "me" });
    const historyId = profile.data.historyId ?? "";

    return { emails, historyId };
  }

  /**
   * Fetches emails that changed since the given `historyId`.
   *
   * Uses the Gmail History API to find message IDs that were added, deleted,
   * or had label changes, then fetches and parses each unique message.
   *
   * @param historyId - The historyId from a previous sync.
   * @returns An object containing the changed emails and the new historyId.
   */
  async fetchIncrementalUpdates(
    historyId: string,
  ): Promise<{ emails: EmailMessage[]; newHistoryId: string }> {
    const gmail = await this.getClient();

    // Collect all affected message IDs from history records
    const messageIds = new Set<string>();
    let pageToken: string | undefined;

    do {
      const response = await gmail.users.history.list({
        userId: "me",
        startHistoryId: historyId,
        historyTypes: [
          "messageAdded",
          "messageDeleted",
          "labelAdded",
          "labelRemoved",
        ],
        pageToken,
      });

      const histories = response.data.history ?? [];
      for (const record of histories) {
        // messagesAdded
        for (const added of record.messagesAdded ?? []) {
          if (added.message?.id) messageIds.add(added.message.id);
        }
        // messagesDeleted — we still fetch to let sync-to-db handle deletions
        for (const deleted of record.messagesDeleted ?? []) {
          if (deleted.message?.id) messageIds.add(deleted.message.id);
        }
        // labelsAdded
        for (const labelAdded of record.labelsAdded ?? []) {
          if (labelAdded.message?.id) messageIds.add(labelAdded.message.id);
        }
        // labelsRemoved
        for (const labelRemoved of record.labelsRemoved ?? []) {
          if (labelRemoved.message?.id)
            messageIds.add(labelRemoved.message.id);
        }
      }

      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);

    console.log(
      `[GmailAccount] Incremental sync found ${messageIds.size} changed messages for account ${this.accountId}`,
    );

    // Fetch and parse each unique message
    const emails = await this.fetchAndParseMessages(gmail, [...messageIds]);

    // Get new historyId
    const profile = await gmail.users.getProfile({ userId: "me" });
    const newHistoryId = profile.data.historyId ?? "";

    return { emails, newHistoryId };
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Paginates through `users.messages.list` to collect all matching message IDs.
   */
  private async listAllMessageIds(
    gmail: gmail_v1.Gmail,
    q?: string,
  ): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;

    do {
      const response = await gmail.users.messages.list({
        userId: "me",
        q: q ?? undefined,
        maxResults: 100,
        pageToken,
      });

      const messages = response.data.messages ?? [];
      for (const msg of messages) {
        if (msg.id) ids.push(msg.id);
      }

      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);

    return ids;
  }

  /**
   * Fetches raw MIME for each message ID, parses it, and maps to `EmailMessage`.
   * Applies a 50ms delay between requests to respect Gmail API rate limits.
   */
  private async fetchAndParseMessages(
    gmail: gmail_v1.Gmail,
    messageIds: string[],
  ): Promise<EmailMessage[]> {
    const emails: EmailMessage[] = [];

    for (let i = 0; i < messageIds.length; i++) {
      const id = messageIds[i]!;

      try {
        // Rate limiting: 50ms delay between requests
        if (i > 0) {
          await this.delay(RATE_LIMIT_DELAY_MS);
        }

        const response = await gmail.users.messages.get({
          userId: "me",
          id,
          format: "raw",
        });

        const raw = response.data.raw;
        if (!raw) {
          console.warn(
            `[GmailAccount] Message ${id} has no raw data, skipping`,
          );
          continue;
        }

        // Decode the base64url-encoded MIME
        const mimeBuffer = Buffer.from(raw, "base64url");

        // Parse MIME with mailparser
        const parsed = await simpleParser(mimeBuffer);

        // Map to our EmailMessage interface
        const email = this.mapToEmailMessage(
          parsed,
          response.data,
        );

        emails.push(email);
      } catch (err) {
        // Log and skip individual message failures — don't abort the whole sync
        console.error(
          `[GmailAccount] Failed to fetch/parse message ${id} (${i + 1}/${messageIds.length}):`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    return emails;
  }

  /**
   * Maps a parsed MIME message + Gmail metadata to our `EmailMessage` interface.
   *
   * This is the critical bridge between the Gmail API and `sync-to-db.ts`.
   * Every field is mapped to match what the old Aurinko API produced.
   */
  private mapToEmailMessage(
    parsed: Awaited<ReturnType<typeof simpleParser>>,
    gmailData: gmail_v1.Schema$Message,
  ): EmailMessage {
    const labelIds = gmailData.labelIds ?? [];

    // Map Gmail labels → sysLabels
    const sysLabels = labelIds
      .map((label) => LABEL_MAP[label])
      .filter((mapped): mapped is SysLabel => mapped !== undefined);

    // Map Gmail categories → sysClassifications
    const sysClassifications = labelIds
      .map((label) => CATEGORY_MAP[label])
      .filter(
        (mapped): mapped is SysClassification => mapped !== undefined,
      );

    // Date handling: prefer parsed date, fall back to internalDate, then now
    const parsedDate = parsed.date
      ?? (gmailData.internalDate
        ? new Date(parseInt(gmailData.internalDate, 10))
        : new Date());
    const dateIso = parsedDate.toISOString();

    // Address mapping helpers
    const mapAddress = (
      addr: { name?: string; address?: string } | undefined,
    ): EmailAddress => ({
      name: addr?.name ?? "",
      address: addr?.address ?? "",
    });

    const mapAddresses = (
      addrs:
        | { value: Array<{ name?: string; address?: string }> }
        | undefined,
    ): EmailAddress[] => {
      if (!addrs?.value) return [];
      return addrs.value.map((a) => ({
        name: a.name ?? "",
        address: a.address ?? "",
      }));
    };

    // Map attachments
    const attachments: EmailAttachment[] = (parsed.attachments ?? []).map(
      (att) => ({
        id: att.checksum ?? crypto.randomUUID(),
        name: att.filename ?? "unnamed",
        mimeType: att.contentType ?? "application/octet-stream",
        size: att.size ?? 0,
        inline: att.contentDisposition === "inline",
        contentId: att.cid ?? undefined,
      }),
    );

    // Build internetHeaders — only keep useful ones
    const internetHeaders: EmailHeader[] = [];
    if (parsed.headers) {
      for (const [name, value] of parsed.headers) {
        if (USEFUL_HEADERS.has(name.toLowerCase())) {
          internetHeaders.push({
            name,
            value: typeof value === "string" ? value : String(value),
          });
        }
      }
    }

    // Handle references (can be string or array)
    let references: string | undefined;
    if (parsed.references) {
      references = Array.isArray(parsed.references)
        ? parsed.references.join(" ")
        : parsed.references;
    }

    // Handle inReplyTo — mailparser may return a string or object
    const inReplyTo =
      typeof parsed.inReplyTo === "string" ? parsed.inReplyTo : undefined;

    return {
      id: gmailData.id ?? "",
      threadId: gmailData.threadId ?? "",
      createdTime: dateIso,
      lastModifiedTime: dateIso,
      sentAt: dateIso,
      receivedAt: dateIso,
      internetMessageId: parsed.messageId ?? "",
      subject: parsed.subject ?? "(no subject)",
      sysLabels,
      keywords: [],
      sysClassifications,
      sensitivity: "normal",
      meetingMessageMethod: undefined,
      from: mapAddress(parsed.from?.value?.[0]),
      to: mapAddresses(parsed.to as any),
      cc: mapAddresses(parsed.cc as any),
      bcc: mapAddresses(parsed.bcc as any),
      replyTo: mapAddresses(parsed.replyTo as any),
      hasAttachments: (parsed.attachments?.length ?? 0) > 0,
      body: parsed.html || parsed.textAsHtml || parsed.text || "",
      bodySnippet: (parsed.text ?? "").substring(0, 200),
      attachments,
      inReplyTo,
      references,
      threadIndex: undefined,
      internetHeaders,
      nativeProperties: {},
      folderId: undefined,
      omitted: [],
    };
  }
}
