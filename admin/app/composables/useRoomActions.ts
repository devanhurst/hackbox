// Shared room mutations (revive / delete / save settings). Each performs the
// request, surfaces a toast, and resolves to whether it succeeded so callers can
// refresh and close UI.
export function useRoomActions() {
  const toast = useToast();
  const apiUrl = useApi();

  async function run(
    label: string,
    successTitle: string,
    fn: () => Promise<{ ok: boolean; error?: string }>,
  ): Promise<boolean> {
    try {
      const data = await fn();
      if (data.ok) {
        toast.add({ title: successTitle, color: "success", icon: "i-lucide-check" });
        return true;
      }
      toast.add({ title: `${label} failed`, description: data.error, color: "error" });
      return false;
    } catch (e: unknown) {
      toast.add({ title: `${label} failed`, description: String(e), color: "error" });
      return false;
    }
  }

  const reviveRoom = (id: string) =>
    run("Revive", "Room revived", () => $fetch(apiUrl("revive"), { method: "POST", body: { id } }));

  const deleteRoom = (id: string) =>
    run("Delete", "Room deleted", () => $fetch(apiUrl("delete"), { method: "POST", body: { id } }));

  const saveSettings = (
    id: string,
    settings: { twitchRequired: boolean; persistent: boolean; closed: boolean },
  ) =>
    run("Save", "Settings saved", () =>
      $fetch(apiUrl("settings"), { method: "POST", body: { id, ...settings } }),
    );

  return { reviveRoom, deleteRoom, saveSettings };
}
