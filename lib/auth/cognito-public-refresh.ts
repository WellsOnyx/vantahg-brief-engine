/**
 * Edge-safe Cognito refresh. The app client has no secret
 * (auth-stack generateSecret: false), so InitiateAuth REFRESH_TOKEN_AUTH
 * is a plain HTTPS call. Middleware uses this to rotate an id token
 * inside the absolute session cap without pulling the AWS SDK into Edge.
 */

export interface PublicRefreshInput {
  region: string;
  clientId: string;
  refreshToken: string;
}

export interface PublicRefreshTokens {
  id_token: string;
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export async function refreshCognitoPublic(
  input: PublicRefreshInput,
  fetchImpl: typeof fetch = fetch,
): Promise<PublicRefreshTokens | null> {
  if (!input.region || !input.clientId || !input.refreshToken) return null;
  const endpoint = `https://cognito-idp.${input.region}.amazonaws.com/`;
  let res: Response;
  try {
    res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-amz-json-1.1',
        'x-amz-target': 'AWSCognitoIdentityProviderService.InitiateAuth',
      },
      body: JSON.stringify({
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: input.clientId,
        AuthParameters: { REFRESH_TOKEN: input.refreshToken },
      }),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as {
    AuthenticationResult?: {
      IdToken?: string;
      AccessToken?: string;
      RefreshToken?: string;
      ExpiresIn?: number;
    };
  } | null;
  const tokens = body?.AuthenticationResult;
  if (!tokens?.IdToken || !tokens.AccessToken) return null;
  return {
    id_token: tokens.IdToken,
    access_token: tokens.AccessToken,
    refresh_token: tokens.RefreshToken,
    expires_in: tokens.ExpiresIn ?? 3600,
  };
}
