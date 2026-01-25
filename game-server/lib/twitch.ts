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
): Promise<TwitchMetadata | undefined> => {
  if (!twitchAccessToken) return undefined;

  try {
    const response = await fetch("https://api.twitch.tv/helix/users", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${twitchAccessToken}`,
        "Client-Id": process.env.TWITCH_CLIENT_ID,
      },
    });

    if (response.ok) {
      const data = (await response.json()) as UsersResponse;
      const userData = data.data[0];

      return {
        id: userData.id,
        username: userData.display_name,
        photo: userData.profile_image_url,
      };
    } else {
      return undefined;
    }
  } catch {
    return undefined;
  }
};
