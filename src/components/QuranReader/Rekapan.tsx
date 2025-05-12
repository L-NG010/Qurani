import router from "@/routes";
import { defineComponent, ref, onMounted, reactive, watch, computed, watchEffect } from "vue";
import vSelect from "vue-select";
import "vue-select/dist/vue-select.css";
import toast from "@/lib/toast";
import { useRoute } from "vue-router";
import "./index.css";
import axios from "axios";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { useEventListener } from "@vueuse/core";

import { Chapters } from "@/types"; // Impor dari types/index.ts
import { useChapters } from "@/hooks/chapters";
import { useJuzs, Juz } from "@/hooks/juzs";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Jakarta");

const apiUrl: string = "http://localhost";
const style = document.createElement("style");
style.innerHTML = `
  .swal2-container {
    z-index: 10000 !important;
    padding-bottom: 100px !important;
  }
  .swal2-popup {
    margin-top: -100px !important;
  }
`;
document.head.appendChild(style);

const errorKeyMapping: Record<string, string> = {
  Mad: "sa-1",
  Ghunnah: "sa-2",
  "Harokat Tertukar": "sa-3",
  "Huruf Tambah/Kurang": "sa-4",
  "Lupa (tidak dibaca)": "sa-5",
  "Makhroj (pengucapan huruf)": "sa-6",
  "Nun Mati dan Tanwin": "sa-7",
  "Qalqalah (memantul)": "sa-8",
  "Tasydid (penekanan)": "sa-9",
  "Urutan Huruf atau Kata": "sa-10",
  "Waqof atau Washol (berhenti atau lanjut)": "sa-11",
  "Waqof dan Ibtida (berhenti dan memulai)": "sa-12",
  Lainnya: "sa-13",
  "Ayat Lupa (tidak dibaca)": "sa-14",
  "Ayat Waqof atau Washol (berhenti atau lanjut)": "sa-15",
  "Ayat Waqof dan Ibtida (berhenti dan memulai)": "sa-16",
};

interface MarkedError {
  salahKey: string;
  salah: string;
  NamaSurat: string;
  Page: number;
  noAyat: number;
  kata?: {
    id: number;
    original_id: number;
    char_type_name: string;
    text_uthmani: string;
    page_number: number;
    text: string;
    created_at: string;
    updated_at: string;
  };
  isVerseError: boolean;
}

interface SetoranData {
  user_name: string;
  penyimak_name: string;
  surat_id?: number;
  surat_name?: string;
  juz_id?: string;
  halaman?: string;
  tampilkan_type: string;
  setoran_type: string;
}

export default defineComponent({
  name: "Rekapan",
  components: { vSelect },
  setup() {
    const setoranData = ref<SetoranData | null>(null);
    const participantName = ref<string>("");
    const penyimakName = ref<string>("");
    const route = useRoute();
    const isFetching = ref<boolean>(false);
    const isSubmitting = ref<boolean>(false);

    const chapters = useChapters();
    const juzs = useJuzs();
    const markedErrors = ref<MarkedError[]>([]);
    const recapData = reactive({
      namaPenyimak: "",
      kesimpulan: "",
      catatan: "",
      namapeserta: "",
      surahDibaca: "",
      awalHalaman: "",
      akhirHalaman: "",
    });
    const submissionNotification = ref("");
    const selectedStartVerse = ref<number>(1);
    const selectedEndVerse = ref<number>(1);
    const selectedStartSurah = ref<string>("");
    const selectedEndSurah = ref<string>("");
    const selectedJuz = ref<string>("");

    const pageConclusions = reactive<Record<string, string>>({});
    const pageNotes = reactive<Record<string, string>>({});
    const panels = ref<Record<string, boolean>>({});

    function initializePageData(start: number, end: number) {
      start = start || 1;
      end = end || start;
      for (let page = start; page <= end; page++) {
        pageConclusions[page.toString()] = pageConclusions[page.toString()] || recapData.kesimpulan || "Lancar";
        pageNotes[page.toString()] = pageNotes[page.toString()] || "";
        if (panels.value[page.toString()] === undefined) {
          panels.value[page.toString()] = true;
        }
      }
      saveToLocalStorage();
      console.log("Debug: Initialized page data:", { pageConclusions, pageNotes, panels: panels.value });
    }

    function decodeUnicode(str: string | undefined | null): string {
      if (typeof str !== "string") return "";
      return str.replace(/\\u([\dA-Fa-f]{4})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      );
    }

    function initializeJuz(juzId: string) {
      if (!juzId) {
        console.warn("⚠️ initializeJuz called with empty juzId");
        return;
      }
      const juz = juzs.data.value.find((j) => j.juz_number.toString() === juzId);
      if (juz && juz.pages && juz.pages.length === 2) {
        recapData.awalHalaman = juz.pages[0].toString();
        recapData.akhirHalaman = juz.pages[1].toString();

        const suratIds = Object.keys(juz.verse_mapping).map(Number);
        if (suratIds.length > 0) {
          const suratNames = suratIds
            .map((id) => chapters.data.value.find((ch) => ch.id === id)?.name_simple || `Surat ${id}`)
            .join(", ");
          recapData.surahDibaca = suratNames || `Juz ${juzId}`;

          const startSuratId = Math.min(...suratIds);
          const endSuratId = Math.max(...suratIds);
          const startChapter = chapters.data.value.find((ch) => ch.id === startSuratId);
          const endChapter = chapters.data.value.find((ch) => ch.id === endSuratId);

          if (startChapter && endChapter) {
            selectedStartSurah.value = startChapter.name_simple;
            selectedEndSurah.value = endChapter.name_simple;
          } else {
            console.warn(`⚠️ Surat untuk Juz ${juzId} tidak ditemukan`);
          }

          initializePageData(juz.pages[0], juz.pages[1]);
        } else {
          console.warn(`⚠️ verse_mapping untuk Juz ${juzId} kosong`);
          recapData.surahDibaca = `Juz ${juzId}`;
        }
      } else {
        console.warn(`⚠️ Data juz ${juzId} tidak valid:`, juz);
        toast.error(`Juz ${juzId} tidak memiliki data halaman yang valid.`);
      }
    }

    function loadSetoranFromLocalStorage() {
      if (isFetching.value) return;
      isFetching.value = true;

      try {
        const userName = localStorage.getItem("user_name") || "";
        const penyimakNameValue = localStorage.getItem("penyimak_name") || "";
        const suratId = localStorage.getItem("surat_id") || "";
        const suratName = localStorage.getItem("surat_name") || "";
        const juzId = localStorage.getItem("juz_id") || "";
        const halaman = localStorage.getItem("halaman") || "";
        const tampilkanType = localStorage.getItem("tampilkan_type") || "surat";
        const setoranType = localStorage.getItem("setoran_type") || "tahfidz";

        console.log("Debug: LocalStorage values:", {
          userName,
          penyimakNameValue,
          suratId,
          suratName,
          juzId,
          halaman,
          tampilkanType,
          setoranType,
        });

        if (!userName || !penyimakNameValue) {
          console.warn("⚠️ Data user_name atau penyimak_name tidak ditemukan di localStorage");
          toast.error("Data peserta atau penyimak tidak lengkap. Silakan isi form ulang.");
          return;
        }

        setoranData.value = {
          user_name: userName,
          penyimak_name: penyimakNameValue,
          surat_id: suratId ? Number(suratId) : undefined,
          surat_name: suratName,
          juz_id: juzId,
          halaman: halaman,
          tampilkan_type: tampilkanType,
          setoran_type: setoranType,
        };

        participantName.value = userName;
        penyimakName.value = penyimakNameValue;
        recapData.namapeserta = userName;
        recapData.namaPenyimak = penyimakNameValue;

        if (tampilkanType === "surat" && suratId) {
          const chapter = chapters.data.value.find((ch) => ch.id === Number(suratId));
          if (chapter && chapter.pages && chapter.pages.length > 0) {
            recapData.surahDibaca = chapter.name_simple;
            selectedStartSurah.value = chapter.name_simple;
            selectedEndSurah.value = chapter.name_simple;
            recapData.awalHalaman = chapter.pages[0].toString();
            recapData.akhirHalaman = chapter.pages[chapter.pages.length - 1].toString();
            initializePageData(parseInt(recapData.awalHalaman), parseInt(recapData.akhirHalaman));
          } else {
            console.warn(`⚠️ Surat dengan ID ${suratId} tidak ditemukan di chapters`);
            toast.error("Surat tidak ditemukan. Silakan pilih ulang.");
          }
        } else if (tampilkanType === "juz" && juzId) {
          selectedJuz.value = juzId;
          console.log("Debug: Setting selectedJuz to", juzId);
        } else if (tampilkanType === "halaman" && halaman) {
          recapData.awalHalaman = halaman;
          recapData.akhirHalaman = halaman;
          const chapter = chapters.data.value.find((ch) => ch.pages?.includes(parseInt(halaman)));
          if (chapter) {
            recapData.surahDibaca = chapter.name_simple;
            selectedStartSurah.value = chapter.name_simple;
            selectedEndSurah.value = chapter.name_simple;
            initializePageData(parseInt(halaman), parseInt(halaman));
          }
        }

        localStorage.setItem("participantName", participantName.value);
        localStorage.setItem("penyimakName", penyimakName.value);
        localStorage.setItem("selectedSurah", recapData.surahDibaca);
        localStorage.setItem("startPage", recapData.awalHalaman);
        localStorage.setItem("endPage", recapData.akhirHalaman);
        localStorage.setItem(
          "recapData",
          JSON.stringify({
            ...JSON.parse(localStorage.getItem("recapData") || "{}"),
            Peserta: participantName.value,
            Penyimak: penyimakName.value,
            timestamp: dayjs.tz().format(),
          })
        );

        console.log("Debug: Data setoran dari localStorage:", setoranData.value);
      } catch (error) {
        console.error("Gagal memuat data dari localStorage:", error);
        toast.error("Gagal memuat data setoran: " + (error as Error).message);
      } finally {
        isFetching.value = false;
      }
    }

    function loadErrorsFromLocalStorage() {
      const savedErrors = localStorage.getItem("kesalahan");
      if (savedErrors) {
        try {
          const parsed = JSON.parse(savedErrors);
          const newErrors: MarkedError[] = [];
          if (parsed.ayatSalah && parsed.kataSalah) {
            const ayatErrors = parsed.ayatSalah.map((err: { salahKey: string; jenisKesalahan: string; surah: string; page?: number; ayat: number }) => ({
              salahKey: err.salahKey,
              salah: err.jenisKesalahan,
              NamaSurat: err.surah,
              Page: err.page || getVersePage(err.surah, err.ayat) || parseInt(recapData.awalHalaman) || 1,
              noAyat: err.ayat,
              kata: null,
              isVerseError: true,
            }));
            const kataErrors = Object.entries(parsed.kataSalah).flatMap(([salah, data]: [string, any]) =>
              data.words.map((text: string, index: number) => ({
                salahKey: data.salahKey,
                salah,
                NamaSurat: recapData.surahDibaca || "",
                Page: data.pages?.[index] || data.page || getVersePage(recapData.surahDibaca || "", 1) || parseInt(recapData.awalHalaman) || 1,
                noAyat: 0,
                kata: {
                  id: Date.now() + index,
                  original_id: data.ids?.[index] || 0,
                  char_type_name: "word",
                  text_uthmani: decodeUnicode(text),
                  page_number: data.pages?.[index] || data.page || parseInt(recapData.awalHalaman) || 1,
                  text: decodeUnicode(text),
                  created_at: dayjs.tz().format(),
                  updated_at: dayjs.tz().format(),
                },
                isVerseError: false,
              }))
            );
            newErrors.push(...ayatErrors, ...kataErrors);
          } else {
            newErrors.push(
              ...parsed.map((err: { salah: string; salahKey: string; NamaSurat: string; Page?: number; noAyat: number; kata?: any }) => ({
                salah: err.salah,
                salahKey: err.salahKey,
                NamaSurat: err.NamaSurat,
                Page: err.Page || getVersePage(err.NamaSurat, err.noAyat) || parseInt(recapData.awalHalaman) || 1,
                noAyat: err.noAyat,
                kata: err.kata
                  ? {
                      ...err.kata,
                      text: decodeUnicode(err.kata.text),
                      text_uthmani: decodeUnicode(err.kata.text_uthmani),
                      page_number: err.kata.page_number || parseInt(recapData.awalHalaman) || 1,
                      created_at: dayjs.tz().format(),
                      updated_at: dayjs.tz().format(),
                    }
                  : null,
                isVerseError: !err.kata,
              }))
            );
          }
          markedErrors.value = newErrors;
          console.log("Debug: Loaded kesalahan from localStorage:", markedErrors.value);
        } catch (error) {
          console.error("Gagal memuat kesalahan dari localStorage:", error);
          toast.error("Gagal memuat data kesalahan: " + (error as Error).message);
        }
      }
    }

    onMounted(() => {
      loadSetoranFromLocalStorage();
      loadErrorsFromLocalStorage();
      juzs.load();
      chapters.load();
      if (!recapData.surahDibaca && chapters.data.value.length > 0) {
        recapData.surahDibaca = chapters.data.value[0].name_simple;
        selectedStartSurah.value = chapters.data.value[0].name_simple;
        selectedEndSurah.value = chapters.data.value[0].name_simple;
      }
      loadFromLocalStorage();
      loadPageConclusions();
      if (setoranData.value?.tampilkan_type === "juz" && !selectedJuz.value) {
        selectedJuz.value = localStorage.getItem("juz_id") || "1";
        console.log("Debug: Forcing selectedJuz to", selectedJuz.value);
      }
      useEventListener(window, "scroll", () => {
        loadErrorsFromLocalStorage();
        console.log("Debug: Scroll detected, reloaded kesalahan");
      });
    });

    watch(selectedJuz, (newVal) => {
      console.log("Debug: selectedJuz changed to", newVal);
      if (newVal && setoranData.value?.tampilkan_type === "juz") {
        initializeJuz(newVal);
      }
    });

    watchEffect(() => {
      if (
        selectedJuz.value &&
        chapters.data.value.length > 0 &&
        juzs.data.value.length > 0 &&
        setoranData.value?.tampilkan_type === "juz"
      ) {
        console.log("Debug: watchEffect triggered for initializeJuz with juzId =", selectedJuz.value);
        initializeJuz(selectedJuz.value);
      }
    });

    watch(selectedStartSurah, (newVal) => {
      const chapter = chapters.data.value.find((ch) => ch.name_simple === newVal);
      if (chapter && chapter.pages && chapter.pages.length > 0) {
        recapData.awalHalaman = chapter.pages[0].toString();
        initializePageData(parseInt(recapData.awalHalaman), parseInt(recapData.akhirHalaman));
      }
    }, { immediate: true });

    watch(selectedEndSurah, (newVal) => {
      const chapter = chapters.data.value.find((ch) => ch.name_simple === newVal);
      if (chapter && chapter.pages && chapter.pages.length > 0) {
        recapData.akhirHalaman = chapter.pages[chapter.pages.length - 1].toString();
        initializePageData(parseInt(recapData.awalHalaman), parseInt(recapData.akhirHalaman));
      }
    }, { immediate: true });

    const selectedStartChapter = computed(() => {
      return chapters.data.value.find((ch) => ch.name_simple === selectedStartSurah.value) || null;
    });
    const selectedEndChapter = computed(() => {
      return chapters.data.value.find((ch) => ch.name_simple === selectedEndSurah.value) || null;
    });

    const totalStartVerses = computed(() => {
      return selectedStartChapter.value ? selectedStartChapter.value.verses_count : 0;
    });
    const totalEndVerses = computed(() => {
      return selectedEndChapter.value ? selectedEndChapter.value.verses_count : 0;
    });

    const startVerseOptions = computed(() => {
      return Array.from({ length: totalStartVerses.value }, (_, i) => i + 1);
    });
    const endVerseOptions = computed(() => {
      return Array.from({ length: totalEndVerses.value }, (_, i) => i + 1);
    });

    watch(totalStartVerses, (newVal) => {
      if (newVal > 0) {
        selectedStartVerse.value = 1;
      }
    }, { immediate: true });
    watch(totalEndVerses, (newVal) => {
      if (newVal > 0) {
        selectedEndVerse.value = newVal;
      }
    }, { immediate: true });

    const ayatSalah = computed(() => {
      return markedErrors.value
        .filter((err) => err.isVerseError)
        .map((err) => ({
          surah: err.NamaSurat,
          ayat: err.noAyat,
          jenisKesalahan: err.salah,
          salahKey: err.salahKey,
        }));
    });

    const kataSalah = computed(() => {
      const errorsByType: Record<string, { count: number; words: string[]; salahKey: string }> = {};
      markedErrors.value.forEach((err) => {
        if (!err.isVerseError && err.kata) {
          if (!errorsByType[err.salah]) {
            errorsByType[err.salah] = { count: 0, words: [], salahKey: err.salahKey };
          }
          errorsByType[err.salah].count += 1;
          errorsByType[err.salah].words.push(decodeUnicode(err.kata.text));
        }
      });
      return errorsByType;
    });

    const getErrorColor = (salahKey: string): string => {
      const colorMap: Record<string, string> = {
        "sa-1": "#CCCCCC",
        "sa-2": "#99CCFF",
        "sa-3": "#DFF18F",
        "sa-4": "#F4ACB6",
        "sa-5": "#FA7656",
        "sk-1": "#FFCC99",
        "sk-2": "#F4A384",
        "sk-3": "#F8DD74",
        "sk-4": "#D5B6D4",
        "sk-5": "#B5C9DF",
        "sk-6": "#FE7D8F",
        "sk-7": "#A1D4CF",
        "sk-8": "#90CBAA",
        "sk-9": "#FA7656",
        "sk-10": "#FE7D8F",
        "sk-11": "#90CBAA",
        "sk-12": "#F8DD74",
        "sk-13": "#CC99CC",
        "sk-14": "#CCCCCC",
      };
      return colorMap[salahKey] || "#6c757d";
    };

    function submitRecap() {
      if (isSubmitting.value) return;
      if (!recapData.namapeserta) {
        toast.error("Nama Peserta tidak boleh kosong.");
        return;
      }
      if (!recapData.namaPenyimak) {
        toast.error("Nama Penyimak tidak boleh kosong.");
        return;
      }
      if (!recapData.kesimpulan) {
        toast.error("Pilih Kesimpulan");
        return;
      }
      if (
        !selectedStartSurah.value ||
        !selectedEndSurah.value ||
        !recapData.awalHalaman ||
        !recapData.akhirHalaman ||
        !selectedStartVerse.value ||
        !selectedEndVerse.value
      ) {
        toast.error("Lengkapi semua field wajib (Surah, Ayat, Halaman)");
        return;
      }

      isSubmitting.value = true;

      const tampilkanType = setoranData.value?.tampilkan_type || "surat";
      console.log("Debug: tampilkanType =", tampilkanType);
      console.log("Debug: setoranData =", JSON.stringify(setoranData.value, null, 2));
      console.log("Debug: selectedJuz =", selectedJuz.value);
      console.log("Debug: localStorage.juz_id =", localStorage.getItem("juz_id"));

      let nomor: string;
      if (tampilkanType === "juz") {
        nomor = selectedJuz.value || setoranData.value?.juz_id || "1";
        console.log("Debug: nomor for juz =", nomor);
        if (!nomor || nomor === "") {
          toast.error("Juz ID tidak ditemukan. Silakan pilih Juz.");
          console.error("Error: Juz ID is empty");
          isSubmitting.value = false;
          return;
        }
      } else if (tampilkanType === "surat") {
        nomor = (setoranData.value?.surat_id ?? "").toString();
        console.log("Debug: nomor for surat =", nomor);
        if (!nomor || nomor === "") {
          toast.error("Surat ID tidak ditemukan. Silakan pilih Surat.");
          console.error("Error: Surat ID is empty");
          isSubmitting.value = false;
          return;
        }
      } else if (tampilkanType === "halaman") {
        nomor = recapData.awalHalaman;
        console.log("Debug: nomor for halaman =", nomor);
        if (!nomor || nomor === "") {
          toast.error("Halaman awal tidak ditemukan. Silakan pilih Halaman.");
          console.error("Error: Halaman awal is empty");
          isSubmitting.value = false;
          return;
        }
      } else {
        toast.error("Tipe tampilan tidak valid.");
        console.error("Error: Invalid tampilkanType:", tampilkanType);
        isSubmitting.value = false;
        return;
      }

      const recapPayload = {
        Peserta: recapData.namapeserta,
        Penyimak: recapData.namaPenyimak,
        Kesimpulan: recapData.kesimpulan,
        Catatan: recapData.catatan,
        AwalSurat: selectedStartSurah.value,
        AwalAyat: selectedStartVerse.value,
        AkhirSurat: selectedEndSurah.value,
        AkhirAyat: selectedEndVerse.value,
        AwalHalaman: recapData.awalHalaman,
        AkhirHalaman: recapData.akhirHalaman,
        Timestamp: dayjs.tz().format(),
        SetoranType: setoranData.value?.setoran_type || "tahfidz",
        TampilkanType: tampilkanType,
        JuzId: tampilkanType === "juz" ? nomor : null,
        nomor: nomor,
        Kesalahan: {
          ayatSalah: ayatSalah.value.map((err) => ({
            surah: err.surah,
            ayat: err.ayat,
            jenisKesalahan: err.jenisKesalahan,
            salahKey: err.salahKey,
            page: markedErrors.value.find(
              (e) => e.isVerseError && e.NamaSurat === err.surah && e.noAyat === err.ayat
            )?.Page || parseInt(recapData.awalHalaman) || 1,
          })),
          kataSalah: Object.entries(kataSalah.value).reduce(
            (acc, [key, data]) => {
              const pages = markedErrors.value
                .filter((e) => !e.isVerseError && e.salah === key)
                .map((e) => e.Page);
              return {
                ...acc,
                [key]: {
                  count: data.count,
                  words: data.words,
                  salahKey: data.salahKey,
                  pages: pages.length === data.words.length ? pages : new Array(data.words.length).fill(parseInt(recapData.awalHalaman) || 1),
                  ids: markedErrors.value
                    .filter((e) => !e.isVerseError && e.salah === key)
                    .map((e) => e.kata?.original_id || 0),
                },
              };
            },
            {}
          ),
        },
        Perhalaman: {
          ayat: {
            awal: selectedStartVerse.value,
            akhir: selectedEndVerse.value,
          },
          conclusions: Object.keys(pageConclusions).length > 0
            ? pageConclusions
            : { [recapData.awalHalaman]: recapData.kesimpulan || "Lancar" },
          awal_halaman: recapData.awalHalaman,
          akhir_halaman: recapData.akhirHalaman,
        },
        CatatanPerhalaman: Object.keys(pageNotes).length > 0
          ? pageNotes
          : { [recapData.awalHalaman]: "" },
      };

      console.log("Debug: Submitting recap payload:", JSON.stringify(recapPayload, null, 2));

      axios
        .post("http://127.0.0.1:8000/api/v1/recap", recapPayload, {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        })
        .then((response) => {
          console.log("Response:", response.data);
          toast.success("Data berhasil dikirim ke server!");
          localStorage.setItem("recapData", JSON.stringify(recapPayload));
          localStorage.removeItem("selectedMember");
          localStorage.removeItem("user_name");
          localStorage.removeItem("penyimak_name");
          localStorage.removeItem("surat_id");
          localStorage.removeItem("surat_name");
          localStorage.removeItem("juz_id");
          localStorage.removeItem("halaman");
          localStorage.removeItem("tampilkan_type");
          localStorage.removeItem("setoran_type");
          localStorage.removeItem("kesalahan");

          setTimeout(() => {
            if (window.top && window.top !== window) {
              window.top.location.href = `${apiUrl}/qurani`;
            } else {
              window.location.href = `${apiUrl}/qurani`;
            }
          }, 3000);

          setTimeout(() => {
            if (router.currentRoute.value.name !== "rekapan") {
              localStorage.removeItem("kesalahan");
              markedErrors.value = [];
            }
          }, 5000);
        })
        .catch((error) => {
          const errorMessage = error.response?.data?.message || error.message;
          const errorDetails = error.response?.data?.errors
            ? JSON.stringify(error.response.data.errors, null, 2)
            : "";
          toast.error(`Gagal mengirim data ke server: ${errorMessage}\n${errorDetails}`);
          console.error("Error:", error.response?.data || error.message);
        })
        .finally(() => {
          setTimeout(() => {
            isSubmitting.value = false;
          }, 500);
        });
    }

    function goBack() {
      if (window.top && window.top !== window) {
        window.top.location.href = `${apiUrl}/qurani`;
      } else {
        window.location.href = `${apiUrl}/qurani`;
      }
    }

    const surahOptions = computed(() => {
      return chapters.data.value.map((ch) => ch.name_simple);
    });

    const juzOptions = computed(() => {
      return juzs.data.value.map((juz) => ({
        label: `Juz ${juz.juz_number}`,
        value: juz.juz_number.toString(),
      }));
    });

    const errorsByPage = computed(() => {
      const pages: Record<number, { ayatSalah: MarkedError[]; kataSalah: MarkedError[] }> = {};
      const startPage = parseInt(recapData.awalHalaman) || 1;
      const endPage = parseInt(recapData.akhirHalaman) || startPage;

      for (let page = startPage; page <= endPage; page++) {
        pages[page] = { ayatSalah: [], kataSalah: [] };
      }

      markedErrors.value.forEach((err) => {
        let page = err.Page;
        if (!page || page < startPage || page > endPage) {
          console.warn(`⚠️ Invalid page ${page} untuk kesalahan:`, err);
          page = getVersePage(err.NamaSurat, err.noAyat) || startPage;
        }
        if (err.isVerseError) {
          pages[page].ayatSalah.push(err);
        } else {
          pages[page].kataSalah.push(err);
        }
      });

      console.log("Debug: errorsByPage computed:", pages);
      return pages;
    });

    const getVersePage = (chapterName: string, verseNumber: number): number => {
      const chapter = chapters.data.value.find((ch) => ch.name_simple === chapterName);
      if (!chapter || !chapter.pages || chapter.pages.length === 0) {
        console.warn(`⚠️ Chapter ${chapterName} tidak ditemukan, default ke halaman 1`);
        return parseInt(recapData.awalHalaman) || 1;
      }
      const totalVerses = chapter.verses_count;
      const totalPages = chapter.pages.length;
      const pageIndex = Math.floor(((verseNumber - 1) / totalVerses) * totalPages);
      return chapter.pages[Math.min(pageIndex, totalPages - 1)] || parseInt(recapData.awalHalaman) || 1;
    };

    const saveToLocalStorage = () => {
      localStorage.setItem("pageConclusions", JSON.stringify(pageConclusions));
      localStorage.setItem("pageNotes", JSON.stringify(pageNotes));
      localStorage.setItem("panels", JSON.stringify(panels.value));
      console.log("Debug: Saved to localStorage:", { pageConclusions, pageNotes, panels: panels.value });
    };

    const loadFromLocalStorage = () => {
      const savedConclusions = localStorage.getItem("pageConclusions");
      const savedNotes = localStorage.getItem("pageNotes");
      const savedPanels = localStorage.getItem("panels");

      if (savedConclusions) {
        Object.assign(pageConclusions, JSON.parse(savedConclusions));
      }
      if (savedNotes) {
        Object.assign(pageNotes, JSON.parse(savedNotes));
      }
      if (savedPanels) {
        panels.value = JSON.parse(savedPanels);
      }
      console.log("Debug: Loaded from localStorage:", { pageConclusions, pageNotes, panels: panels.value });
    };

    watch(pageConclusions, saveToLocalStorage, { deep: true });
    watch(pageNotes, saveToLocalStorage, { deep: true });
    watch(panels, saveToLocalStorage, { deep: true });

    watch(
      () => [recapData.awalHalaman, recapData.akhirHalaman],
      ([awal, akhir]) => {
        const start = parseInt(awal) || 1;
        const end = parseInt(akhir) || start;
        initializePageData(start, end);
      },
      { immediate: true }
    );

    watch(
      errorsByPage,
      (newVal) => {
        Object.keys(newVal).forEach((page) => {
          if (panels.value[page] === undefined) {
            panels.value[page] = true;
          }
        });
        saveToLocalStorage();
        console.log("Debug: panels updated:", panels.value);
      },
      { immediate: true }
    );

    const togglePanel = (page: string) => {
      panels.value[page] = !panels.value[page];
      saveToLocalStorage();
    };

    const savePageConclusions = () => {
      localStorage.setItem("pageConclusions", JSON.stringify(pageConclusions));
           console.log("Debug: Saved page conclusions to localStorage:", pageConclusions);
    };

    const loadPageConclusions = () => {
      const saved = localStorage.getItem("pageConclusions");
      if (saved) {
        try {
          Object.assign(pageConclusions, JSON.parse(saved));
          console.log("Debug: Loaded page conclusions from localStorage:", pageConclusions);
        } catch (error) {
          console.error("Gagal memuat kesimpulan halaman dari localStorage:", error);
          toast.error("Gagal memuat kesimpulan halaman: " + (error as Error).message);
        }
      }
    };

    return {
      setoranData,
      participantName,
      penyimakName,
      recapData,
      selectedStartSurah,
      selectedEndSurah,
      selectedStartVerse,
      selectedEndVerse,
      selectedJuz,
      surahOptions,
      juzOptions,
      startVerseOptions,
      endVerseOptions,
      pageConclusions,
      pageNotes,
      panels,
      errorsByPage,
      markedErrors,
      submissionNotification,
      isSubmitting,
      isFetching,
      submitRecap,
      goBack,
      togglePanel,
      getErrorColor,
      initializePageData,
      decodeUnicode,
      saveToLocalStorage,
      loadFromLocalStorage,
    };
  },
  render() {
    const conclusions = ["Lancar", "Kurang Lancar", "Tidak Lancar"];
    const startPage = parseInt(this.recapData.awalHalaman) || 1;
    const endPage = parseInt(this.recapData.akhirHalaman) || startPage;
    const pages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);

    return (
      <div class="container mt-5">
        <h1 class="mb-4">Rekapan Setoran</h1>

        {this.isFetching ? (
          <div class="text-center">
            <div class="spinner-border" role="status">
              <span class="visually-hidden">Memuat...</span>
            </div>
          </div>
        ) : (
          <>
            <div class="card mb-4">
              <div class="card-header">Informasi Setoran</div>
              <div class="card-body">
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Nama Peserta</label>
                    <input
                      type="text"
                      class="form-control"
                      vModel={this.recapData.namapeserta}
                      disabled
                    />
                  </div>
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Nama Penyimak</label>
                    <input
                      type="text"
                      class="form-control"
                      vModel={this.recapData.namaPenyimak}
                      disabled
                    />
                  </div>
                </div>
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Surah Awal</label>
                    <vSelect
                      vModel={this.selectedStartSurah}
                      options={this.surahOptions}
                      placeholder="Pilih Surah Awal"
                    />
                  </div>
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Ayat Awal</label>
                    <select
                      class="form-select"
                      vModel={this.selectedStartVerse}
                    >
                      {this.startVerseOptions.map((verse) => (
                        <option key={verse} value={verse}>
                          {verse}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Surah Akhir</label>
                    <vSelect
                      vModel={this.selectedEndSurah}
                      options={this.surahOptions}
                      placeholder="Pilih Surah Akhir"
                    />
                  </div>
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Ayat Akhir</label>
                    <select
                      class="form-select"
                      vModel={this.selectedEndVerse}
                    >
                      {this.endVerseOptions.map((verse) => (
                        <option key={verse} value={verse}>
                          {verse}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {this.setoranData?.tampilkan_type === "juz" && (
                  <div class="row">
                    <div class="col-md-12 mb-3">
                      <label class="form-label">Juz</label>
                      <vSelect
                        vModel={this.selectedJuz}
                        options={this.juzOptions}
                        label="label"
                        value="value"
                        placeholder="Pilih Juz"
                      />
                    </div>
                  </div>
                )}
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Halaman Awal</label>
                    <input
                      type="number"
                      class="form-control"
                      vModel={this.recapData.awalHalaman}
                    />
                  </div>
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Halaman Akhir</label>
                    <input
                      type="number"
                      class="form-control"
                      vModel={this.recapData.akhirHalaman}
                    />
                  </div>
                </div>
                <div class="mb-3">
                  <label class="form-label">Kesimpulan</label>
                  <select
                    class="form-select"
                    vModel={this.recapData.kesimpulan}
                  >
                    <option value="">Pilih Kesimpulan</option>
                    {conclusions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div class="mb-3">
                  <label class="form-label">Catatan</label>
                  <textarea
                    class="form-control"
                    vModel={this.recapData.catatan}
                    rows={4}
                  ></textarea>
                </div>
              </div>
            </div>

            {pages.map((page) => (
              <div key={page} class="card mb-3">
                <div
                  class="card-header d-flex justify-content-between align-items-center"
                  onClick={() => this.togglePanel(page.toString())}
                  style={{ cursor: "pointer" }}
                >
                  <h5 class="mb-0">Halaman {page}</h5>
                  <i
                    class={this.panels[page.toString()] ? "bi bi-chevron-up" : "bi bi-chevron-down"}
                  ></i>
                </div>
                {this.panels[page.toString()] && (
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Kesimpulan Halaman</label>
                      <select
                        class="form-select"
                        vModel={this.pageConclusions[page.toString()]}
                      >
                        {conclusions.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Catatan Halaman</label>
                      <textarea
                        class="form-control"
                        vModel={this.pageNotes[page.toString()]}
                        rows={3}
                      ></textarea>
                    </div>
                    {this.errorsByPage[page]?.ayatSalah?.length > 0 && (
                      <div class="mb-3">
                        <h6>Kesalahan Ayat</h6>
                        <ul class="list-group">
                          {this.errorsByPage[page].ayatSalah.map((err, index) => (
                            <li
                              key={`ayat-${page}-${index}`}
                              class="list-group-item"
                              style={{
                                backgroundColor: this.getErrorColor(err.salahKey),
                              }}
                            >
                              Ayat {err.noAyat}: {err.salah}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {this.errorsByPage[page]?.kataSalah?.length > 0 && (
                      <div class="mb-3">
                        <h6>Kesalahan Kata</h6>
                        <ul class="list-group">
                          {this.errorsByPage[page].kataSalah.map((err, index) => (
                            <li
                              key={`kata-${page}-${index}`}
                              class="list-group-item"
                              style={{
                                backgroundColor: this.getErrorColor(err.salahKey),
                              }}
                            >
                              Kata "{this.decodeUnicode(err.kata?.text_uthmani)}": {err.salah}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            <div class="d-flex justify-content-between mt-4">
              <button
                class="btn btn-secondary"
                onClick={this.goBack}
                disabled={this.isSubmitting}
              >
                Kembali
              </button>
              <button
                class="btn btn-primary"
                onClick={this.submitRecap}
                disabled={this.isSubmitting}
              >
                {this.isSubmitting ? (
                  <span
                    class="spinner-border spinner-border-sm"
                    role="status"
                    aria-hidden="true"
                  ></span>
                ) : (
                  "Kirim Rekapan"
                )}
              </button>
            </div>

            {this.submissionNotification && (
              <div class="alert alert-info mt-3">{this.submissionNotification}</div>
            )}
          </>
        )}
      </div>
    );
  },
});