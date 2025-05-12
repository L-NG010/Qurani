import { Chapters, QuranReader, Words } from "@/types";
import { defineComponent, PropType, ref, computed, Teleport, onMounted, onBeforeUnmount, inject ,Ref} from "vue";
import { Tooltip as BSTooltip, Popover as BSPopover } from "bootstrap";
import { useI18n } from "vue-i18n";
import { useChapters } from "@/hooks/chapters";
import Tooltip from "../Tooltip/Tooltip";
import ButtonBookmark from "./Button/Bookmark";
import ButtonCopy from "./Button/Copy";
import ButtonPlay from "./Button/Play";
import Popover from "../Popover/Popover";
import styles from "./ArabicText.module.scss";
import AlertDialog from "../AlertDialog/AlertDialog";
import { useSettings } from "@/hooks/settings";

// Interface Kesalahan
interface Kesalahan {
  salahKey: string;
  salah: string;
  NamaSurat: string;
  Page: number;
  noAyat: number;
  verseKey: string;
  wordKey?: string;
  kata: {
    char_type: string;
    id: number;
    text: string;
  } | null;
}

export default defineComponent({
  props: {
    words: {
      type: Array as PropType<Words[]>,
      required: true,
    },
    chapterId: {
      type: Number,
    },
    verseNumber: {
      type: Number,
    },
    highlight: {
      type: [Number, Boolean],
      default: false,
    },
    enableHover: {
      type: Boolean,
      default: false,
    },
    showTooltipWhenHighlight: {
      type: Boolean,
      default: false,
    },
    showTransliterationInline: {
      type: Boolean,
      default: false,
    },
    showTranslationInline: {
      type: Boolean,
      default: false,
    },
    showTransliterationTooltip: {
      type: Boolean,
      default: false,
    },
    showTranslationTooltip: {
      type: Boolean,
      default: false,
    },
    buttons: {
      type: Array as PropType<QuranReader["PROPS_BUTTON"]>,
      default: () => [],
    },
  },
  setup(props) {
    const { t } = useI18n();
    const chapters = useChapters();
    const settings = useSettings();
    const { fontType } = settings;

    // Inject with fallback
    const kesalahan = inject<Ref<Kesalahan[]>>("kesalahan", ref<Kesalahan[]>([]));
    const saveKesalahan = inject<() => void>("saveKesalahan", () => {
      console.warn("ArabicText.tsx: saveKesalahan not provided, using fallback.");
      try {
        const groupedData = {
          ayatSalah: kesalahan.value
            .filter((err) => err.kata === null)
            .map((err) => ({
              surah: err.NamaSurat,
              ayat: err.noAyat,
              jenisKesalahan: err.salah,
              salahKey: err.salahKey,
              page: err.Page,
              verseKey: err.verseKey,
            })),
          kataSalah: kesalahan.value
            .filter((err) => err.kata !== null)
            .reduce((acc, err) => {
              const key = err.salah;
              if (!acc[key]) {
                acc[key] = {
                  count: 0,
                  words: [],
                  wordKeys: [],
                  salahKey: err.salahKey,
                  page: err.Page,
                  verseKey: err.verseKey,
                };
              }
              acc[key].count += 1;
              acc[key].words.push(err.kata!.text);
              acc[key].wordKeys.push(err.wordKey || `${err.verseKey}:${err.kata!.id}`);
              return acc;
            }, {} as Record<string, { count: number; words: string[]; wordKeys: string[]; salahKey: string; page: number; verseKey: string }>),
        };
        localStorage.setItem("kesalahan", JSON.stringify(groupedData));
        console.log("ArabicText.tsx: Saved grouped kesalahan to localStorage:", groupedData);
      } catch (error) {
        console.error("ArabicText.tsx: Failed to save kesalahan (fallback):", error);
      }
    });

    // Fungsi untuk memuat kesalahan dengan aman
    const loadKesalahan = () => {
      const storedKesalahan = localStorage.getItem("kesalahan");
      if (storedKesalahan) {
        try {
          const parsed = JSON.parse(storedKesalahan);
          if (parsed.ayatSalah && parsed.kataSalah) {
            const ayatKesalahan = parsed.ayatSalah.map((err: any) => ({
              salahKey: err.salahKey,
              salah: err.jenisKesalahan,
              NamaSurat: err.surah,
              Page: err.page || (props.words.length > 0 ? props.words[0].page_number : 0),
              noAyat: err.ayat,
              verseKey: err.verseKey || `${props.chapterId}:${err.ayat}`,
              kata: null,
            }));
            const kataKesalahan = Object.entries(parsed.kataSalah).flatMap(([salah, data]: [string, any]) =>
              data.words.map((text: string, index: number) => ({
                salahKey: data.salahKey,
                salah,
                NamaSurat: chapter.value?.name_simple || "",
                Page: data.page || (props.words.length > 0 ? props.words[0].page_number : 0),
                noAyat: props.verseNumber || 0,
                verseKey: data.verseKey || `${props.chapterId}:${props.verseNumber}`,
                wordKey: data.wordKeys?.[index] || `${props.chapterId}:${props.verseNumber}:${Date.now() + index}`,
                kata: { char_type: "word", id: Date.now() + index, text },
              }))
            );
            kesalahan.value = [...ayatKesalahan, ...kataKesalahan];
            console.log("ArabicText.tsx: Loaded and converted kesalahan from localStorage:", kesalahan.value);
          } else if (Array.isArray(parsed)) {
            kesalahan.value = parsed.map((err: any) => ({
              ...err,
              verseKey: err.verseKey || `${props.chapterId}:${err.noAyat}`,
              wordKey: err.kata ? err.wordKey || `${props.chapterId}:${err.noAyat}:${err.kata.id}` : undefined,
            }));
            console.log("ArabicText.tsx: Loaded kesalahan from localStorage:", kesalahan.value);
          } else {
            console.warn("ArabicText.tsx: Invalid kesalahan data in localStorage, resetting to empty array.");
            kesalahan.value = [];
          }
        } catch (error) {
          console.error("ArabicText.tsx: Failed to load kesalahan from localStorage:", error);
          kesalahan.value = [];
        }
      }
    };

    const tooltipInstance = ref<Record<number, BSTooltip>>({});
    const popoverInstance = ref<Record<number, BSPopover>>({});
    const popover = ref<BSPopover | null>(null);
    const isHover = ref<boolean>(false);
    const isModalVisible = ref<boolean>(false);
    const modalContent = ref<string>("");
    const isLoadingSettings = ref<boolean>(false);
    const refs = ref<{ popoverContent: HTMLElement | null }>({ popoverContent: null });
    const verseKey = computed<string>(() => {
      return [props.chapterId, props.verseNumber].filter((v) => v !== undefined).join(":");
    });
    const chapter = computed<Chapters | null>(() => {
      return props.chapterId ? chapters.find(props.chapterId) : null;
    });
    const textUthmani = computed<string>(() => {
      return props.words.map((word) => word.text_uthmani).join(" ");
    });
    const shouldUseButton = computed<boolean>(() => {
      return props.buttons.length > 0 && props.chapterId !== undefined && props.verseNumber !== undefined;
    });
    const correctionTarget = ref<"ayat" | "kata">("kata");
    const selectedWord = ref<Words | null>(null);
    const errorColors = ref<Record<string, string>>({});
    const checkedErrors = ref<Record<string, boolean>>({});
    const customLabels = ref<Record<string, string>>({});
    const errorKeysOrder = ref<string[]>([]);
    const errorTypes = ref<Record<string, "ayat" | "kata">>({});
    const selectedUser = ref<any>(null);
    const selectedGroup = ref<any>(null);
    const apiErrorMessage = ref<string | null>(null);
    const renderCount = ref<number>(0);
    const errorsToRemove = ref<Kesalahan[]>([]); // Menyimpan daftar kesalahan untuk penghapusan

    // Muat kesalahan setiap kali komponen di-mount untuk menjaga konsistensi saat scroll
    onMounted(() => {
      renderCount.value++;
      console.log(`ArabicText.tsx: Component rendered ${renderCount.value} times for verseKey: ${verseKey.value}`);
      loadKesalahan(); // Selalu muat ulang untuk memastikan data konsisten

      const groupId = localStorage.getItem("group_id");
      const userId = localStorage.getItem("user_id");

      console.log("ArabicText.tsx: group_id from localStorage:", groupId);
      console.log("ArabicText.tsx: user_id from localStorage:", userId);

      if (groupId && groupId !== "null" && !isNaN(Number(groupId))) {
        selectedGroup.value = { id: Number(groupId) };
        fetchSettings(Number(groupId), null);
      } else if (userId && userId !== "null" && !isNaN(Number(userId))) {
        selectedUser.value = { id: Number(userId) };
        fetchSettings(null, Number(userId));
      } else {
        apiErrorMessage.value = "Tidak ada grup atau pengguna yang dipilih.";
      }

      window.addEventListener("setoranDataReceived", handleSetoranDataReceived);
      window.addEventListener("keydown", handleKeydown);
    });

    onBeforeUnmount(() => {
      window.removeEventListener("setoranDataReceived", handleSetoranDataReceived);
      window.removeEventListener("keydown", handleKeydown);
      isHover.value = false;
      Object.keys(tooltipInstance.value).forEach((key) => tooltipInstance.value[Number(key)]?.hide());
      Object.keys(popoverInstance.value).forEach((key) => popoverInstance.value[Number(key)]?.hide());
    });

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
        console.log(`ArabicText.tsx: Settings saved to localStorage with key ${settingsKey}`);
      } catch (e) {
        console.error(`ArabicText.tsx: Failed to save to localStorage with key ${settingsKey}:`, e);
      }
    };

    const loadErrorSettings = (settingsKey: string) => {
      const stored = localStorage.getItem(settingsKey);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (!parsed.errorKeysOrder || !parsed.customLabels || !parsed.errorTypes) {
            console.warn(`ArabicText.tsx: Incomplete localStorage data for ${settingsKey}, removing data`);
            localStorage.removeItem(settingsKey);
            return false;
          }
          errorColors.value = parsed.errorColors || {};
          checkedErrors.value = parsed.checkedErrors || {};
          customLabels.value = parsed.customLabels || {};
          errorKeysOrder.value = parsed.errorKeysOrder || [];
          errorTypes.value = parsed.errorTypes || {};
          console.log(`ArabicText.tsx: Settings loaded from localStorage with key ${settingsKey}`);
          return true;
        } catch (e) {
          console.error("ArabicText.tsx: Failed to parse settings from localStorage:", e);
          localStorage.removeItem(settingsKey);
          return false;
        }
      }
      return false;
    };

    const processApiData = (apiData: any[], settingsKey: string) => {
      console.log("ArabicText.tsx: Processing API data:", apiData);
      const newCheckedErrors: Record<string, boolean> = {};
      const newCustomLabels: Record<string, string> = {};
      const newErrorColors: Record<string, string> = {};
      const ayatLabels: { label: string; key: string }[] = [];
      const kataLabels: { label: string; key: string }[] = [];
      const newErrorTypes: Record<string, "ayat" | "kata"> = {};

      apiData.forEach((item: any) => {
        if (item.key && typeof item.key === "string" && (item.key.startsWith("sa-") || item.key.startsWith("sk-"))) {
          const key = item.key;
          const label = item.value && typeof item.value === "string" ? item.value : key;
          newCheckedErrors[key] = item.status === 1;
          newCustomLabels[key] = label;
          newErrorColors[key] = item.color && typeof item.color === "string" ? item.color : "#CCCCCC";
          newErrorTypes[key] = item.key.startsWith("sa-") ? "ayat" : "kata";

          console.log(`ArabicText.tsx: Processed item - key: ${key}, label: ${label}, type: ${newErrorTypes[key]}`);

          if (newErrorTypes[key] === "ayat") {
            ayatLabels.push({ label, key });
          } else {
            kataLabels.push({ label, key });
          }
        } else {
          console.warn(`ArabicText.tsx: Invalid item ignored:`, item);
        }
      });

      const sortedAyatLabels = ayatLabels
        .sort((a, b) => {
          if (a.key === "sa-5") return 1;
          if (b.key === "sa-5") return -1;
          return a.key.localeCompare(b.key);
        })
        .map((item) => item.key);

      const sortedKataLabels = kataLabels
        .sort((a, b) => {
          if (a.key === "sk-14") return 1;
          if (b.key === "sk-14") return -1;
          return a.key.localeCompare(b.key);
        })
        .map((item) => item.key);

      errorKeysOrder.value = [...sortedAyatLabels, ...sortedKataLabels];
      checkedErrors.value = newCheckedErrors;
      customLabels.value = newCustomLabels;
      errorColors.value = newErrorColors;
      errorTypes.value = newErrorTypes;

      console.log("ArabicText.tsx: Processed settings:", {
        errorKeysOrder: errorKeysOrder.value,
        checkedErrors: checkedErrors.value,
        customLabels: customLabels.value,
        errorColors: errorColors.value,
        errorTypes: errorTypes.value,
      });

      saveErrorSettings(settingsKey);
    };

    const fetchSettings = async (groupId: number | null, userId: number | null) => {
      isLoadingSettings.value = true;
      const settingsKey = groupId && !isNaN(groupId) ? `qurani_setting_grup_${groupId}` : userId && !isNaN(userId) ? "qurani_setting_user" : "qurani_setting_global";

      if (loadErrorSettings(settingsKey)) {
        console.log(`ArabicText.tsx: Using data from localStorage for ${settingsKey}`);
        apiErrorMessage.value = null;
        isLoadingSettings.value = false;
        return;
      }

      let apiUrl: string = "https://quranapi-production-b288.up.railway.app/api/v1/";
      if (groupId && !isNaN(groupId)) {
        apiUrl = `${apiUrl}group-qurani-settings/${groupId}`;
        selectedGroup.value = { id: groupId };
        selectedUser.value = null;
        localStorage.setItem("selectedGroup", JSON.stringify({ id: groupId }));
        localStorage.removeItem("selectedUser");
      } else if (userId && !isNaN(userId)) {
        apiUrl = `${apiUrl}user-qurani-settings/${userId}`;
        selectedUser.value = { id: userId };
        selectedGroup.value = null;
        localStorage.setItem("selectedUser", JSON.stringify({ id: userId }));
        localStorage.removeItem("selectedGroup");
      } else {
        console.warn("ArabicText.tsx: No valid groupId or userId.");
        apiErrorMessage.value = "Tidak ada grup atau pengguna yang dipilih.";
        isLoadingSettings.value = false;
        return;
      }

      console.log(`ArabicText.tsx: Fetching settings from ${apiUrl}`);
      try {
        const response = await fetch(apiUrl);
        console.log(`ArabicText.tsx: Response status: ${response.status}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch settings: ${response.status}`);
        }
        const apiData = await response.json();
        console.log("ArabicText.tsx: API data received:", apiData);
        processApiData(apiData, settingsKey);
        apiErrorMessage.value = null;
      } catch (error) {
        console.error("ArabicText.tsx: Failed to fetch settings from API:", error);
        apiErrorMessage.value = `Gagal mengambil pengaturan: ${error.message}`;
      } finally {
        isLoadingSettings.value = false;
      }
    };

    const handleSetoranDataReceived = (event: Event) => {
      const customEvent = event as CustomEvent;
      const data = customEvent.detail;
      console.log("ArabicText.tsx: setoranDataReceived:", data);
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

    const availableErrorLabels = computed(() => {
      return errorKeysOrder.value.filter(
        (key) => key in checkedErrors.value && checkedErrors.value[key] === true && key in customLabels.value && key in errorTypes.value
      );
    });

    const availableWordErrorLabels = computed(() => {
      return availableErrorLabels.value.filter((key) => errorTypes.value[key] === "kata");
    });

    const availableVerseErrorLabels = computed(() => {
      return availableErrorLabels.value.filter((key) => errorTypes.value[key] === "ayat");
    });

    function isHighlightWord(position: number) {
      return props.highlight === position;
    }

    function onInitPopover(key: number) {
      return function (popover: BSPopover) {
        popoverInstance.value[key] = popover;
      };
    }

    function onClickHold(key: number) {
      return function () {
        Object.keys(popoverInstance.value).forEach((keys) => Number(keys) !== key && popoverInstance.value[Number(keys)]?.hide());
        popoverInstance.value[key]?.toggle();
        setTimeout(() => tooltipInstance.value[key]?.hide(), 100);
      };
    }

    function showWrongWordModal(word: Words, isVerseEnd = false) {
      console.log("ArabicText.tsx: showWrongWordModal:", {
        word,
        isVerseEnd,
        customLabels: customLabels.value,
        availableWordErrorLabels: availableWordErrorLabels.value,
        isLoadingSettings: isLoadingSettings.value,
      });

      if (isLoadingSettings.value) {
        modalContent.value = "Memuat pengaturan, silakan tunggu...";
        isModalVisible.value = true;
        return;
      }

      if (!Object.keys(customLabels.value).length) {
        modalContent.value = "Pengaturan label belum dimuat. Silakan coba lagi.";
        apiErrorMessage.value = "Gagal memuat label kesalahan.";
        isModalVisible.value = true;
        return;
      }

      const currentVerseKey = `${props.chapterId}:${props.verseNumber}`;
      const isAlreadyMarked = kesalahan.value.some(
        (err) => (isVerseEnd && err.verseKey === currentVerseKey && err.kata === null) || (!isVerseEnd && err.wordKey === `${currentVerseKey}:${word.id}`)
      );

      if (isAlreadyMarked) {
        correctionTarget.value = isVerseEnd ? "ayat" : "kata";
        // Ambil daftar kesalahan untuk ditampilkan di modal
        errorsToRemove.value = isVerseEnd
          ? kesalahan.value.filter((err) => err.verseKey === currentVerseKey && err.kata === null)
          : kesalahan.value.filter((err) => err.wordKey === `${currentVerseKey}:${word.id}`);
        modalContent.value = isVerseEnd ? `Pilih kesalahan ayat untuk dihapus` : `Pilih kesalahan kata "${word.text_uthmani}" untuk dihapus`;
        isModalVisible.value = true;
      } else {
        correctionTarget.value = isVerseEnd ? "ayat" : "kata";
        modalContent.value = isVerseEnd
          ? `Surat ${chapter.value?.name_simple} Ayat ke ${props.verseNumber} (Halaman ${props.words[0]?.page_number || 0})`
          : `Kata ${word.text_uthmani} (Halaman ${word.page_number})`;
        isModalVisible.value = true;
      }
      selectedWord.value = word;
    }

    function getWordStyle(word: Words) {
      const currentVerseKey = `${props.chapterId}:${props.verseNumber}`;
      const currentWordKey = `${currentVerseKey}:${word.id}`;
      const error = kesalahan.value.find((err) => err.wordKey === currentWordKey);
      if (error && error.salahKey in errorColors.value) {
        return { backgroundColor: errorColors.value[error.salahKey] };
      }
      return {};
    }

    function handleKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeModal();
      }
    }

    function markError(word: Words | null, salahKey: string, isVerseError: boolean = false) {
      console.log("ArabicText.tsx: Before adding kesalahan:", kesalahan.value);

      let pageNumber: number | undefined;
      let sanitizedWord: Kesalahan["kata"] = null;
      const currentVerseKey = `${props.chapterId}:${props.verseNumber}`;

      if (word && !isVerseError) {
        sanitizedWord = {
          char_type: word.char_type_name,
          id: word.id,
          text: word.text_uthmani,
        };
        pageNumber = word.page_number;
      } else {
        pageNumber = props.words.length > 0 ? props.words[0].page_number : 0;
      }

      const isDuplicate = kesalahan.value.some(
        (err) =>
          err.salahKey === salahKey &&
          err.verseKey === currentVerseKey &&
          (isVerseError ? err.kata === null : err.kata?.id === sanitizedWord?.id)
      );

      if (isDuplicate) {
        console.log("ArabicText.tsx: Duplicate kesalahan detected, skipping addition.");
        closeModal();
        return;
      }

      loadKesalahan();
      const newKesalahan: Kesalahan = {
        salahKey,
        salah: customLabels.value[salahKey] || salahKey,
        NamaSurat: chapter.value?.name_simple || "",
        Page: pageNumber,
        noAyat: props.verseNumber!,
        verseKey: currentVerseKey,
        wordKey: sanitizedWord ? `${currentVerseKey}:${sanitizedWord.id}` : undefined,
        kata: sanitizedWord,
      };

      kesalahan.value = [...kesalahan.value, newKesalahan];
      console.log("ArabicText.tsx: After adding kesalahan:", kesalahan.value);

      saveKesalahan();
      closeModal();
    }

    function removeMarkedError(word: Words | null, isVerseError: boolean = false, salahKey: string) {
      console.log("ArabicText.tsx: Before removing kesalahan:", kesalahan.value);
      
      const currentVerseKey = `${props.chapterId}:${props.verseNumber}`;
      
      if (isVerseError) {
        kesalahan.value = kesalahan.value.filter(
          (err) => !(err.verseKey === currentVerseKey && err.kata === null && err.salahKey === salahKey)
        );
      } else if (word) {
        const currentWordKey = `${currentVerseKey}:${word.id}`;
        kesalahan.value = kesalahan.value.filter(
          (err) => !(err.wordKey === currentWordKey && err.salahKey === salahKey)
        );
      }
      
      console.log("ArabicText.tsx: After removing kesalahan:", kesalahan.value);
      saveKesalahan();
      closeModal();
    }

    function closeModal() {
      isModalVisible.value = false;
      apiErrorMessage.value = null;
      errorsToRemove.value = [];
    }

    function onMouseOver(key: number) {
      isHover.value = true;
      if (!props.showTooltipWhenHighlight || !isHighlightWord(key)) {
        tooltipInstance.value[key]?.show();
      }
    }

    function onMouseLeave(key: number) {
      isHover.value = false;
      if (!props.showTooltipWhenHighlight || !isHighlightWord(key)) {
        tooltipInstance.value[key]?.hide();
      }
    }

    function wordWrapper(word: Words, children: any) {
      if (!shouldUseButton.value) {
        return children;
      }
      return (
        <Popover
          key={`popover-${word.id}`}
          placement="top"
          options={{ html: true, trigger: "manual", content: () => refs.value.popoverContent! }}
          onInit={onInitPopover(word.position)}
        >
          {{
            title: () => <div class="text-center">{t("quran-reader.word-number", { ayah: props.verseNumber })}</div>,
            default: () => children,
          }}
        </Popover>
      );
    }

    function selectWord(position: number) {
      selectedWord.value = props.words.find((word) => word.position === position) || null;
    }

    function getVerseErrorStyle() {
      const verseError = kesalahan.value.find((err) => err.kata === null && err.verseKey === verseKey.value);
      if (verseError && verseError.salahKey in errorColors.value) {
        if (fontType.value === "Default") {
          return {
            backgroundColor: errorColors.value[verseError.salahKey],
            padding: "26px 1px 14px 1px",
          };
        } else if (fontType.value === "Uthmanic") {
          return {
            backgroundColor: errorColors.value[verseError.salahKey],
            padding: "28px 1px 13px 1px",
          };
        }
      }
      return {};
    }

    return {
      t,
      tooltipInstance,
      popoverInstance,
      verseKey,
      refs,
      chapter,
      textUthmani,
      popover,
      isHover,
      shouldUseButton,
      isHighlightWord,
      onInitPopover,
      onClickHold,
      onMouseOver,
      onMouseLeave,
      wordWrapper,
      showWrongWordModal,
      handleVerseClick: () => {
        if (props.chapterId && props.verseNumber) {
          modalContent.value = `Anda mengklik seluruh ayat ${props.verseNumber} dari surat ${props.chapterId}`;
          isModalVisible.value = true;
        }
      },
      modalContent,
      isModalVisible,
      AlertDialog,
      closeModal,
      correctionTarget,
      customLabels,
      selectedWord,
      selectWord,
      kesalahan,
      errorColors,
      getWordStyle,
      markError,
      removeMarkedError,
      getVerseErrorStyle,
      availableWordErrorLabels,
      availableVerseErrorLabels,
      selectedUser,
      selectedGroup,
      apiErrorMessage,
      isLoadingSettings,
      errorsToRemove,
    };
  },
  render() {
    return (
      <>
        <Teleport to="body">
          {this.isModalVisible && (
            <div
              class="modal fade show d-block"
              tabindex="-1"
              style={{ background: "rgba(0, 0, 0, 0.5)" }}
              onClick={this.closeModal}
            >
              <div class="modal-dialog modal-dialog-centered" onClick={(e: MouseEvent) => e.stopPropagation()}>
                <div class="modal-content mt-5" style={{ maxHeight: "90vh", overflowY: "auto" }}>
                  <div class="modal-header">
                    <h5 class="modal-title">{this.modalContent}</h5>
                    <button type="button" class="btn-close" onClick={this.closeModal}></button>
                  </div>
                  <div class="modal-body">
                    {this.apiErrorMessage ? (
                      <div class="alert alert-danger" role="alert">
                        {this.apiErrorMessage}
                      </div>
                    ) : this.isLoadingSettings ? (
                      <p>Memuat label kesalahan...</p>
                    ) : this.errorsToRemove.length > 0 ? (
                      this.errorsToRemove.map((err: Kesalahan) => (
                        <button
                          key={err.salahKey}
                          class="w-100 mb-2 btn btn-danger"
                          onClick={() => this.removeMarkedError(this.selectedWord, this.correctionTarget === "ayat", err.salahKey)}
                        >
                          Hapus {err.salah}
                        </button>
                      ))
                    ) : this.correctionTarget === "kata" ? (
                      <>
                        {this.availableWordErrorLabels.length > 0 ? (
                          this.availableWordErrorLabels.map((key: string) => (
                            <button
                              key={key}
                              class="w-100 mb-2 btn"
                              onClick={() => this.markError(this.selectedWord, key)}
                              style={{
                                backgroundColor: this.errorColors[key] || "#CCCCCC",
                                borderWidth: "2px",
                                fontWeight: "500",
                                textAlign: "left",
                                color: "#000000",
                              }}
                            >
                              {key in this.customLabels ? this.customLabels[key] : key}
                            </button>
                          ))
                        ) : (
                          <p>Tidak ada label kesalahan kata yang tersedia.</p>
                        )}
                      </>
                    ) : (
                      <>
                        {this.availableVerseErrorLabels.length > 0 ? (
                          this.availableVerseErrorLabels.map((key: string) => (
                            <button
                              key={key}
                              class="w-100 mb-2 btn"
                              onClick={() => this.markError(null, key, true)}
                              style={{
                                backgroundColor: this.errorColors[key] || "#CCCCCC",
                                borderWidth: "2px",
                                fontWeight: "500",
                                textAlign: "left",
                                color: "#000000",
                              }}
                            >
                              {key in this.customLabels ? this.customLabels[key] : key}
                            </button>
                          ))
                        ) : (
                          <p>Tidak ada label kesalahan ayat yang tersedia.</p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Teleport>
        <span
          dir="rtl"
          class={[
            styles.arabic_text,
            {
              [styles.highlight]: this.highlight === true,
              [styles.hover]: this.isHover && this.enableHover,
              [styles.verse_error]: this.kesalahan.some((err) => err.kata === null && err.verseKey === this.verseKey),
            },
          ]}
          style={this.getVerseErrorStyle()}
          onMouseover={() => (this.isHover = true)}
          onMouseleave={() => (this.isHover = false)}
        >
          {this.words.map((word: Words) =>
            this.wordWrapper(word, (
              <Tooltip
                key={`tooltip-${word.id}`}
                tag="div"
                timeout={0}
                options={{
                  trigger: "manual",
                  html: true,
                  delay: { show: 500, hide: 2000 },
                }}
                class={[styles.text_wrapper, { [styles.highlight_word]: this.isHighlightWord(word.position), "ps-2": this.showTransliterationInline }]}
                {...{
                  "data-word-position": word.position,
                  "data-word-location": word.location,
                  "data-word-type": word.char_type_name,
                  onclick: () => {
                    this.showWrongWordModal(word, word.char_type_name === "end");
                    this.selectedWord = word;
                  },
                }}
              >
                <div
                  class={["fs-arabic-auto", "text-center", { "font-uthmanic": word.char_type_name === "end", "font-arabic-auto": word.char_type_name === "word" }]}
                  style={this.getWordStyle(word)}
                >
                  {word.text_uthmani}
                </div>
                {this.showTransliterationInline && (
                  <div class="text-center mt-1 mb-1">
                    <i>{word.char_type_name === "word" ? word.transliteration?.text : word.translation?.text}</i>
                  </div>
                )}
                {this.showTranslationInline && (word.char_type_name === "word" || !this.showTransliterationInline) && (
                  <div class="text-center mt-1 mb-1">
                    <p>{word.translation?.text}</p>
                  </div>
                )}
              </Tooltip>
            ))
          )}
        </span>
      </>
    );
  },
});