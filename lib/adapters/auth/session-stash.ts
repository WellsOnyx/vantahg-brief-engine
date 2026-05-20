/**
 * Server-side scratchpad for Cognito Session tokens between InitiateAuth
 * and the user's click-back at /api/auth/callback.
 *
 * Why this exists: Cognito's custom-auth flow returns an opaque `Session`
 * token from InitiateAuth that RespondToAuthChallenge requires. The
 * magic-link URL emailed to the user only contains `{code, user}` —
 * not the Session. So we stash `{sub → Session}` here at InitiateAuth time
 * and retrieve it at callback time.
 *
 * Storage: DynamoDB table (`SESSION_STASH_TABLE`, defaults to
 * `vantaum-prod-auth-session-stash`). Single-use; deleted on read.
 * Short TTL on the table itself (DDB TTL set at the table level — outside
 * this code; expects TTL attribute `expires_at` as epoch seconds).
 *
 * Schema assumed: PK = `sub` (string). If Grok confirms a different
 * schema, only this file needs to change.
 */

import {
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';

const REGION = process.env.COGNITO_REGION || process.env.AWS_REGION || 'us-east-1';
const TABLE_NAME = process.env.SESSION_STASH_TABLE || 'vantaum-prod-auth-session-stash';
const SESSION_TTL_SEC = 600; // 10 minutes — covers email delivery + click latency.

let cachedDoc: DynamoDBDocumentClient | null = null;
function doc(): DynamoDBDocumentClient {
  if (!cachedDoc) {
    const raw = new DynamoDBClient({ region: REGION });
    cachedDoc = DynamoDBDocumentClient.from(raw);
  }
  return cachedDoc;
}

export async function stashSession(sub: string, session: string, username: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await doc().send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        sub,
        session,
        username,
        created_at: now,
        expires_at: now + SESSION_TTL_SEC,
      },
    }),
  );
}

export interface StashedSession {
  session: string;
  username: string;
}

export async function consumeSession(sub: string): Promise<StashedSession | null> {
  const res = await doc().send(
    new GetCommand({ TableName: TABLE_NAME, Key: { sub } }),
  );
  const item = res.Item;
  if (!item) return null;
  const now = Math.floor(Date.now() / 1000);
  if (typeof item.expires_at === 'number' && item.expires_at < now) return null;
  // Single-use: delete before returning so a click can't be replayed.
  await doc()
    .send(new DeleteCommand({ TableName: TABLE_NAME, Key: { sub } }))
    .catch(() => {
      // Best-effort. If the delete fails, TTL still expires the row.
    });
  return {
    session: String(item.session ?? ''),
    username: String(item.username ?? ''),
  };
}
