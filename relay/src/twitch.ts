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
  if (!twitchAccessToken || !clientId) return undefined;

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
      if (!userData) return undefined;

      return {
        id: userData.id,
        username: userData.display_name,
        photo: userData.profile_image_url,
      };
    }

    return undefined;
  } catch {
    return undefined;
  }
};
