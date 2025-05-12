import { computed, defineComponent, ref, onMounted, onBeforeUnmount, nextTick } from "vue";
import { LocaleCode } from "@/types";
import styles from "./Setting.module.scss";
import scroll from "@/helpers/scroll";
import Button from "@/components/Button/Button";
import UsePwa, { DefaultSlotProps } from "../PWA/UsePwa";
import Range from "../Input/Range";
import { useEventListener } from "@vueuse/core";

export default defineComponent({
  emits: {
    "update:show": (value: boolean) => true,
  },
  props: {
    show: {
      type: Boolean,
    },
  },
  setup(props, { emit }) {
    const scaleFitures = ref<boolean>(isSupportScale());
    const shouldShow = computed<boolean>({
      set(value) {
        emit("update:show", value);
      },
      get() {
        return Boolean(props.show);
      },
    });

    function isSupportScale() {
      const touchDevice = navigator.maxTouchPoints || "ontouchstart" in document.documentElement;
      const mobile = /iPhone|iPad|iPod|Android|webOS/i.test(navigator.userAgent);
      return Boolean(touchDevice && mobile);
    }

    useEventListener(window, "resize", () => {
      scaleFitures.value = isSupportScale();
    });

    scroll.disable();

    const errorColors = ref<Record<string, string>>({});
    const checkedErrors = ref<Record<string, boolean>>({});
    const customLabels = ref<Record<string, string>>({});
    const editingLabel = ref<string | null>(null);
    const errorTarget = ref<"global" | "grup" | "pengguna">("global");
    const selectedGroup = ref<any>(null);
    const selectedUser = ref<any>(null);
    const errorKeysOrder = ref<string[]>([]);
    const errorTypes = ref<Record<string, "ayat" | "kata">>({});
    const resetErrorMessage = ref<string | null>(null);
    const apiErrorMessage = ref<string | null>(null);

    const perAyatKeys = computed(() => {
      return errorKeysOrder.value.filter((key) => errorTypes.value[key] === "ayat");
    });
    const perKataKeys = computed(() => {
      return errorKeysOrder.value.filter((key) => errorTypes.value[key] === "kata");
    });

    const getStorageKey = (groupId: number | null, userId: number | null) => {
      if (groupId && !isNaN(groupId)) return `qurani_setting_grup_${groupId}`;
      if (userId && !isNaN(userId)) return "qurani_setting_user";
      return "qurani_setting_global";
    };

    const saveErrorSettings = (settingsKey: string) => {
      const data = {
        checkedErrors: checkedErrors.value,
        customLabels: customLabels.value,
        errorColors: errorColors.value,
        errorKeysOrder: errorKeysOrder.value,
        errorTypes: errorTypes.value,
      };
      try {
        localStorage.setItem(settingsKey, JSON.stringify(data));
      } catch (e) {
        console.error("Setting.tsx: Gagal menyimpan ke localStorage:", e);
      }
    };

    const loadErrorSettings = (settingsKey: string) => {
      const stored = localStorage.getItem(settingsKey);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          errorColors.value = parsed.errorColors || {};
          checkedErrors.value = parsed.checkedErrors || {};
          customLabels.value = parsed.customLabels || {};
          errorKeysOrder.value = parsed.errorKeysOrder || [];
          errorTypes.value = parsed.errorTypes || {};
          return true;
        } catch (e) {
          console.error("Setting.tsx: Gagal mem-parsing pengaturan dari localStorage:", e);
        }
      }
      return false;
    };

    const resetSettings = async () => {
      resetErrorMessage.value = null;
      let apiUrl: string = "https://quranapi-production-b288.up.railway.app/api/v1/";
      let method: string;
      let settingsKey: string;

      if (errorTarget.value === "pengguna" && selectedUser.value?.id) {
        apiUrl = `${apiUrl}user-qurani-settings/${selectedUser.value.id}/reset`;
        method = "DELETE";
        settingsKey = "qurani_setting_user";
      } else if (errorTarget.value === "grup" && selectedGroup.value?.id) {
        apiUrl = `${apiUrl}group-qurani-settings/${selectedGroup.value.id}/reset`;
        method = "POST";
        settingsKey = `qurani_setting_grup_${selectedGroup.value.id}`;
      } else {
        resetErrorMessage.value = "Tidak ada pengguna atau grup yang dipilih untuk reset.";
        return;
      }

      try {
        const response = await fetch(apiUrl, { method });
        if (!response.ok) {
          throw new Error(`Gagal mereset pengaturan: ${response.status}`);
        }
        localStorage.removeItem(settingsKey);
        await fetchSettings(selectedGroup.value?.id, selectedUser.value?.id);
      } catch (error) {
        resetErrorMessage.value = `Gagal mereset pengaturan: ${error.message}`;
      }
    };

    const processApiData = (apiData: any[], settingsKey: string) => {
      const newCheckedErrors: Record<string, boolean> = {};
      const newCustomLabels: Record<string, string> = {};
      const newErrorColors: Record<string, string> = {};
      const newErrorTypes: Record<string, "ayat" | "kata"> = {};
      const errorKeys: string[] = [];

      apiData.forEach((item: any) => {
        if (item.key && (item.key.startsWith("sa-") || item.key.startsWith("sk-")) && item.status === 1) {
          const key = item.key;
          const label = item.value && typeof item.value === "string" ? item.value : key;
          newCheckedErrors[key] = item.status === 1;
          newCustomLabels[key] = label;
          newErrorColors[key] = item.color && typeof item.color === "string" ? item.color : "#CCCCCC";
          newErrorTypes[key] = item.key.startsWith("sa-") ? "ayat" : "kata";
          errorKeys.push(key);
        }
      });

      errorKeysOrder.value = errorKeys;
      checkedErrors.value = newCheckedErrors;
      customLabels.value = newCustomLabels;
      errorColors.value = newErrorColors;
      errorTypes.value = newErrorTypes;

      saveErrorSettings(settingsKey);
    };

    const fetchSettings = async (groupId: number | null, userId: number | null) => {
      const settingsKey = getStorageKey(groupId, userId);

      if (loadErrorSettings(settingsKey)) {
        apiErrorMessage.value = null;
        return;
      }

      let apiUrl: string = "https://quranapi-production-b288.up.railway.app/api/v1/";
      if (groupId && !isNaN(groupId)) {
        apiUrl = `${apiUrl}group-qurani-settings/${groupId}`;
        selectedGroup.value = { id: groupId };
        selectedUser.value = null;
        errorTarget.value = "grup";
        localStorage.setItem("selectedGroup", JSON.stringify({ id: groupId }));
        localStorage.removeItem("selectedUser");
      } else if (userId && !isNaN(userId)) {
        apiUrl = `${apiUrl}user-qurani-settings/${userId}`;
        selectedUser.value = { id: userId };
        selectedGroup.value = null;
        errorTarget.value = "pengguna";
        localStorage.setItem("selectedUser", JSON.stringify({ id: userId }));
        localStorage.removeItem("selectedGroup");
      } else {
        apiUrl = `${apiUrl}global-qurani-settings`;
        errorTarget.value = "global";
      }

      try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
          throw new Error(`Gagal mengambil pengaturan: ${response.status}`);
        }
        const apiData = await response.json();
        processApiData(apiData, settingsKey);
        apiErrorMessage.value = null;
      } catch (error) {
        console.error("Setting.tsx: Gagal mengambil pengaturan dari API:", error);
        apiErrorMessage.value = `Gagal mengambil pengaturan: ${error.message}`;
      }
    };

    const updateSettingsOnLabelChange = (originalKey: string, newLabel: string) => {
      if (originalKey === newLabel) return;

      const index = errorKeysOrder.value.indexOf(originalKey);
      if (index === -1) return;

      const finalLabel = newLabel.trim() || customLabels.value[originalKey];

      const newCustomLabels = { ...customLabels.value };
      newCustomLabels[originalKey] = finalLabel;
      customLabels.value = newCustomLabels;

      const settingsKey = getStorageKey(selectedGroup.value?.id, selectedUser.value?.id);
      saveErrorSettings(settingsKey);
    };

    const handleSetoranDataReceived = (event: Event) => {
      const customEvent = event as CustomEvent;
      const data = customEvent.detail;
      if (data.payloadType === "setoran" && data.group_id && !isNaN(Number(data.group_id))) {
        if (selectedGroup.value?.id !== Number(data.group_id)) {
          fetchSettings(Number(data.group_id), null);
        }
      } else if (data.user_id && !isNaN(Number(data.user_id))) {
        if (selectedUser.value?.id !== Number(data.user_id)) {
          fetchSettings(null, Number(data.user_id));
        }
      }
    };

    onMounted(() => {
      const groupId = localStorage.getItem("group_id");
      const userId = localStorage.getItem("user_id");

      if (groupId && groupId !== "null" && groupId !== "" && !isNaN(Number(groupId))) {
        selectedGroup.value = { id: Number(groupId) };
        errorTarget.value = "grup";
        fetchSettings(Number(groupId), null);
      } else if (userId && userId !== "null" && userId !== "" && !isNaN(Number(userId))) {
        selectedUser.value = { id: Number(userId) };
        errorTarget.value = "pengguna";
        fetchSettings(null, Number(userId));
      } else {
        fetchSettings(null, null);
      }

      window.addEventListener("setoranDataReceived", handleSetoranDataReceived);
    });

    onBeforeUnmount(() => {
      window.removeEventListener("setoranDataReceived", handleSetoranDataReceived);
      scroll.enable();
    });

    return {
      shouldShow,
      scaleFitures,
      errorColors,
      checkedErrors,
      customLabels,
      editingLabel,
      triggerNextTick: () => nextTick(),
      errorTarget,
      selectedGroup,
      selectedUser,
      updateSettingsOnLabelChange,
      errorKeysOrder,
      perAyatKeys,
      perKataKeys,
      resetSettings,
      resetErrorMessage,
      apiErrorMessage,
    };
  },
  render() {
    return (
      <div
        class={styles.container}
        style={{ display: this.shouldShow ? "block" : "none", zIndex: 2147483647 }}
        onClick={(e) => {
          if ((e.target as HTMLElement).classList.contains(styles.card_container)) {
            this.shouldShow = false;
          }
        }}
      >
        <div class={styles.card_container}>
          <div class={[styles.card, "card"]}>
            <div class={[styles.card_header, "card-header d-flex justify-content-between"]}>
              <h4 class="card-title">{this.$t("general.setting")}</h4>
              <div class="h-100 d-flex align-items-center">
                <button class="btn-close" onClick={() => (this.shouldShow = false)} aria-label="Close"></button>
              </div>
            </div>
            <div class={[styles.card_body, "card-body custom-scrollbar"]}>
              {this.apiErrorMessage && (
                <div class="alert alert-danger" role="alert">
                  {this.apiErrorMessage}
                </div>
              )}
              <UsePwa>
                {({
                  default: (props: DefaultSlotProps) => (
                    <>
                      {props.isAvailable && (
                        <div class="d-flex justify-content-center mb-4 mt-3">{props.installButton()}</div>
                      )}
                    </>
                  ),
                })}
              </UsePwa>

              {this.scaleFitures && (
                <>
                  <h6 class="heading-small">
                    {this.$t("general.scale")} ({this.$setting.scale})
                  </h6>
                  <Range v-model={this.$setting.scale} min={0.3} max={1} step={0.1} lazyUpdate />
                </>
              )}

              <h6 class="heading-small">{this.$t("general.language")}</h6>
              <select
                class="form-select mb-2"
                value={this.$setting.locale}
                onInput={(e) => (this.$setting.locale = (e.target as HTMLSelectElement).value as LocaleCode)}
              >
                {Object.keys(this.$config.LOCALE).map((locale) => (
                  <option key={locale} value={locale}>
                    {(this.$config.LOCALE as any)[locale]}
                  </option>
                ))}
              </select>

              <h6 class="heading-small">{this.$t("general.theme")}</h6>
              <nav class="nav nav-pills custom-nav-pills mb-2">
                {this.$config.THEMES.map((theme) => (
                  <div
                    key={theme}
                    class={["nav-link", { active: this.$setting.theme == theme }]}
                    onClick={() => (this.$setting.theme = theme)}
                  >
                    <font-awesome-icon icon={theme == "auto" ? "lightbulb" : theme == "dark" ? "moon" : "sun"} />
                    <span class="ms-2">{this.$t(`setting.theme.${theme}`)}</span>
                  </div>
                ))}
              </nav>
              {this.$setting.theme == "auto" && (
                <small class="text-muted">{this.$t("setting.theme.message.auto")}</small>
              )}

              <hr />

              <h6 class="heading-small">{this.$t("general.error-target")}</h6>
              <select
                class="form-select mb-2"
                value={this.errorTarget}
                onInput={(e) => (this.errorTarget = (e.target as HTMLSelectElement).value as "global" | "grup" | "pengguna")}
              >
                <option value="global">Global</option>
                <option value="grup" disabled={!this.selectedGroup}>
                  Grup {this.selectedGroup ? `(${this.selectedGroup.id})` : ""}
                </option>
                <option value="pengguna" disabled={!this.selectedUser}>
                  Pengguna {this.selectedUser ? `(${this.selectedUser.id})` : ""}
                </option>
              </select>

              <hr />

              {this.resetErrorMessage && (
                <div class="alert alert-danger" role="alert">
                  {this.resetErrorMessage}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <h6 class="heading-small">Kesalahan Per Ayat</h6>
                {this.perAyatKeys.length ? (
                  this.perAyatKeys.map((key) => (
                    <div
                      key={key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        backgroundColor: this.errorColors[key] || "#CCCCCC",
                        padding: "4px 8px",
                        borderRadius: "4px",
                        border: "1px solid #ccc",
                        color: "#000",
                        gap: "8px",
                      }}
                    >
                      <input
                        type="checkbox"
                        class="form-check-input"
                        v-model={this.checkedErrors[key]}
                      />
                      {this.editingLabel === key ? (
                        <input
                          type="text"
                          data-editing={key}
                          style={{
                            border: "none",
                            background: "transparent",
                            width: "100%",
                          }}
                          v-model={this.customLabels[key]}
                          onBlur={() => {
                            const newLabel = this.customLabels[key] ?? "";
                            this.updateSettingsOnLabelChange(key, newLabel);
                            this.editingLabel = null;
                          }}
                        />
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                          <span style={{ flex: "1" }}>{this.customLabels[key] ?? ""}</span>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="24px"
                            height="24px"
                            viewBox="0 0 24 24"
                            fill="none"
                            style={{ cursor: "pointer" }}
                            onClick={() => {
                              this.editingLabel = key;
                              this.triggerNextTick().then(() => {
                                const inputEl = document.querySelector(`input[data-editing="${key}"]`) as HTMLInputElement;
                                if (inputEl) inputEl.focus();
                              });
                            }}
                          >
                            <path
                              d="M11 4H7.2C6.0799 4 5.51984 4 5.09202 4.21799C4.71569 4.40974 4.40973 4.7157 4.21799 5.09202C4 5.51985 4 6.0799 4 7.2V16.8C4 17.9201 4 18.4802 4.21799 18.908C4.40973 19.2843 4.71569 19.5903 5.09202 19.782C5.51984 20 6.0799 20 7.2 20H16.8C17.9201 20 18.4802 20 18.908 19.782C19.2843 19.5903 19.5903 19.2843 19.782 18.908C20 18.4802 20 17.9201 20 16.8V12.5M15.5 5.5L18.3284 8.32843M10.7627 10.2373L17.411 3.58902C18.192 2.80797 19.4584 2.80797 20.2394 3.58902C21.0205 4.37007 21.0205 5.6364 20.2394 6.41745L13.3774 13.2794C12.6158 14.0411 12.235 14.4219 11.8012 14.7247C11.4162 14.9936 11.0009 15.2162 10.564 15.3882C10.0717 15.822 9.54378 15.6885 8.48793 15.9016L8 16L8.04745 15.6678C8.21536 14.4925 8.29932 13.9048 8.49029 13.3561C8.65975 12.8692 8.89125 12.4063 9.17906 11.9786C9.50341 11.4966 9.92319 11.0768 10.7627 10.2373Z"
                              stroke="#000000"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p>Tidak ada kesalahan Per Ayat yang tersedia. Silakan pilih grup atau pengguna.</p>
                )}
              </div>

              <hr />

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <h6 class="heading-small">Kesalahan Per Kata</h6>
                {this.perKataKeys.length ? (
                  this.perKataKeys.map((key) => (
                    <div
                      key={key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        backgroundColor: this.errorColors[key] || "#CCCCCC",
                        padding: "4px 8px",
                        borderRadius: "4px",
                        border: "1px solid #ccc",
                        color: "#000",
                        gap: "8px",
                      }}
                    >
                      <input
                        type="checkbox"
                        class="form-check-input"
                        v-model={this.checkedErrors[key]}
                      />
                      {this.editingLabel === key ? (
                        <input
                          type="text"
                          data-editing={key}
                          style={{
                            border: "none",
                            background: "transparent",
                            width: "100%",
                          }}
                          v-model={this.customLabels[key]}
                          onBlur={() => {
                            const newLabel = this.customLabels[key] ?? "";
                            this.updateSettingsOnLabelChange(key, newLabel);
                            this.editingLabel = null;
                          }}
                        />
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                          <span style={{ flex: "1" }}>{this.customLabels[key] ?? ""}</span>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="24px"
                            height="24px"
                            viewBox="0 0 24 24"
                            fill="none"
                            style={{ cursor: "pointer" }}
                            onClick={() => {
                              this.editingLabel = key;
                              this.triggerNextTick().then(() => {
                                const inputEl = document.querySelector(`input[data-editing="${key}"]`) as HTMLInputElement;
                                if (inputEl) inputEl.focus();
                              });
                            }}
                          >
                            <path
                              d="M11 4H7.2C6.0799 4 5.51984 4 5.09202 4.21799C4.71569 4.40974 4.40973 4.7157 4.21799 5.09202C4 5.51985 4 6.0799 4 7.2V16.8C4 17.9201 4 18.4802 4.21799 18.908C4.40973 19.2843 4.71569 19.5903 5.09202 19.782C5.51984 20 6.0799 20 7.2 20H16.8C17.9201 20 18.4802 20 18.908 19.782C19.2843 19.5903 19.5903 19.2843 19.782 18.908C20 18.4802 20 17.9201 20 16.8V12.5M15.5 5.5L18.3284 8.32843M10.7627 10.2373L17.411 3.58902C18.192 2.80797 19.4584 2.80797 20.2394 3.58902C21.0205 4.37007 21.0205 5.6364 20.2394 6.41745L13.3774 13.2794C12.6158 14.0411 12.235 14.4219 11.8012 14.7247C11.4162 14.9936 11.0009 15.2162 10.564 15.3882C10.0717 15.822 9.54378 15.6885 8.48793 15.9016L8 16L8.04745 15.6678C8.21536 14.4925 8.29932 13.9048 8.49029 13.3561C8.65975 12.8692 8.89125 12.4063 9.17906 11.9786C9.50341 11.4966 9.92319 11.0768 10.7627 10.2373Z"
                              stroke="#000000"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p>Tidak ada kesalahan Per Kata yang tersedia. Silakan pilih grup atau pengguna.</p>
                )}
              </div>

              <hr />

              <div class="d-flex justify-content-center mt-4">
                <Button type="primary" onClick={this.resetSettings}>
                  {this.$t("setting.reset-default")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
});