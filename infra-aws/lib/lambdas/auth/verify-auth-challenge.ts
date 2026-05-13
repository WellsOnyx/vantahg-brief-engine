/**
 * Cognito VerifyAuthChallenge Lambda trigger.
 *
 * Checks that the OTP the user submitted matches what we stashed in
 * DynamoDB when CreateAuthChallenge fired.
 *
 * Delete-on-use: a successful verification removes the OTP from DDB so
 * it can't be replayed.
 */

import { DynamoDBClient, GetItemCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';

const OTP_TABLE = process.env.OTP_TABLE_NAME!;
const ddb = new DynamoDBClient({});

interface VerifyAuthChallengeEvent {
  request: {
    userAttributes: { sub?: string };
    privateChallengeParameters: { sub?: string };
    challengeAnswer: string;
  };
  response: {
    answerCorrect: boolean;
  };
  userName: string;
}

export const handler = async (
  event: VerifyAuthChallengeEvent,
): Promise<VerifyAuthChallengeEvent> => {
  const sub = event.request.privateChallengeParameters.sub ?? event.userName;
  const submittedOtp = (event.request.challengeAnswer ?? '').trim();

  if (!submittedOtp || submittedOtp.length !== 32) {
    event.response.answerCorrect = false;
    return event;
  }

  // Look up the stashed OTP for this user.
  const result = await ddb.send(
    new GetItemCommand({
      TableName: OTP_TABLE,
      Key: { sub: { S: sub } },
    }),
  );

  const stored = result.Item?.otp?.S;
  const expiresAt = Number(result.Item?.expires_at?.N ?? 0);

  if (!stored || expiresAt < Math.floor(Date.now() / 1000)) {
    event.response.answerCorrect = false;
    return event;
  }

  // Constant-time-ish compare. Both strings are hex of fixed length so
  // simple equality is fine here, but keeping a structured check.
  const correct = stored.length === submittedOtp.length && stored === submittedOtp;

  if (correct) {
    // Single-use: delete the OTP so it can't be replayed.
    await ddb.send(
      new DeleteItemCommand({
        TableName: OTP_TABLE,
        Key: { sub: { S: sub } },
      }),
    );
  }

  event.response.answerCorrect = correct;
  return event;
};
