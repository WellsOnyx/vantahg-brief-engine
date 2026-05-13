/**
 * Cognito DefineAuthChallenge Lambda trigger.
 *
 * Decides which authentication challenge to present next. For the magic
 * link flow we issue a single CUSTOM_CHALLENGE (no SRP, no password).
 *
 * Flow:
 *   1. First invocation: session is empty -> issue CUSTOM_CHALLENGE
 *   2. After user submits the OTP from the email -> if VerifyAuthChallenge
 *      marked it correct, issueTokens; otherwise fail.
 */

interface DefineAuthChallengeEvent {
  request: {
    session: Array<{
      challengeName: string;
      challengeResult: boolean;
      challengeMetadata?: string;
    }>;
    userNotFound?: boolean;
  };
  response: {
    issueTokens: boolean;
    failAuthentication: boolean;
    challengeName?: string;
  };
}

export const handler = async (event: DefineAuthChallengeEvent): Promise<DefineAuthChallengeEvent> => {
  const session = event.request.session ?? [];

  // No prior challenge - present the first one.
  if (session.length === 0) {
    event.response.issueTokens = false;
    event.response.failAuthentication = false;
    event.response.challengeName = 'CUSTOM_CHALLENGE';
    return event;
  }

  // Last challenge was a CUSTOM_CHALLENGE; check the result.
  const last = session[session.length - 1];
  if (last.challengeName === 'CUSTOM_CHALLENGE' && last.challengeResult === true) {
    event.response.issueTokens = true;
    event.response.failAuthentication = false;
    return event;
  }

  // 3 strikes - fail and force them to request another link.
  if (session.length >= 3) {
    event.response.issueTokens = false;
    event.response.failAuthentication = true;
    return event;
  }

  // Re-present the challenge.
  event.response.issueTokens = false;
  event.response.failAuthentication = false;
  event.response.challengeName = 'CUSTOM_CHALLENGE';
  return event;
};
