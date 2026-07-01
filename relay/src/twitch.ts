// Stays server-side (in the DO): needs the TWITCH_CLIENT_ID secret, which must
// never reach a client.

export interface TwitchMetadata {
  id: string;
  username: string;
  photo: string;
}

interface UserResponse {
  id: string;
  display_name: string;
  profile_image_url: string;
}

interface UsersResponse {
  data: Array<UserResponse>;
}

export const authenticateWithTwitch = async (
  twitchAccessToken: string | undefined,
  clientId: string | undefined,
): Promise<TwitchMetadata | undefined> => {
  if (!twitchAccessToken) return undefined;

  if (!clientId) {
    // Misconfiguration, not a member problem: the relay can't validate any token
    // without its Twitch app's client id. A member *did* supply a token, so log
    // loudly — an unset TWITCH_CLIENT_ID makes every `twitchRequired` room reject
    // every player.
    console.error("[twitch] TWITCH_CLIENT_ID is not set; cannot validate member tokens");
    return undefined;
  }

  try {
    const response = await fetch("https://api.twitch.tv/helix/users", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${twitchAccessToken}`,
        "Client-Id": clientId,
      },
    });

    if (response.ok) {
      const data = (await response.json()) as UsersResponse;
      const userData = data.data[0];
      if (!userData) {
        console.error("[twitch] /helix/users returned no user for the supplied token");
        return undefined;
      }

      return {
        id: userData.id,
        username: userData.display_name,
        photo: userData.profile_image_url,
      };
    }

    // A 401 here almost always means the token was minted for a *different*
    // Twitch app than TWITCH_CLIENT_ID: Twitch requires the Client-Id header to
    // match the client the OAuth token was issued under. Log the status so that
    // mismatch is diagnosable instead of silently surfacing as "please log in".
    console.error(
      `[twitch] token validation failed: HTTP ${response.status} ${response.statusText}`,
    );
    return undefined;
  } catch (err) {
    console.error("[twitch] token validation threw", err);
    return undefined;
  }
};
