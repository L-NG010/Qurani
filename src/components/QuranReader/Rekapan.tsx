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

// Pindahkan Chapters ke file types/index.ts di masa depan
export interface Chapters {
  id: number;
  bismillah_pre: boolean;
  name_arabic: string;
  name_complex: string;
  name_simple: string;
  pages: number[];
  revelation_order: number;
  revelation_place: string;
  verses_count: number;
  translated_name: { language_name: string; name: string };
}

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
                NamaSurat: recapData.surahDibaca || err.surah || "",
                Page: data.pages?.[index] || data.page || getVersePage(recapData.surahDibaca || err.surah, 1) || parseInt(recapData.awalHalaman) || 1,
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
            if (window.top) {
              window.top.location.href = `${apiUrl}/qurani`;
            }
            else {
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
      if (window.top) {
        window.top.location.href = `${apiUrl}/qurani`;
      }else {
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
      console.log("Debug: Saved pageConclusions:", pageConclusions);
    };

    const loadPageConclusions = () => {
      const savedConclusions = localStorage.getItem("pageConclusions");
      if (savedConclusions) {
        Object.assign(pageConclusions, JSON.parse(savedConclusions));
        console.log("Debug: Loaded pageConclusions:", pageConclusions);
      }
    };

    watch(pageConclusions, savePageConclusions, { deep: true });

    return {
      recapData,
      ayatSalah,
      kataSalah,
      submitRecap,
      goBack,
      getErrorColor,
      submissionNotification,
      selectedStartSurah,
      selectedStartVerse,
      totalStartVerses,
      startVerseOptions,
      selectedEndSurah,
      selectedEndVerse,
      totalEndVerses,
      endVerseOptions,
      chapters,
      surahOptions,
      juzOptions,
      selectedJuz,
      markedErrors,
      getVersePage,
      errorsByPage,
      pageConclusions,
      pageNotes,
      panels,
      togglePanel,
      setoranData,
      participantName,
      penyimakName,
      isSubmitting,
      decodeUnicode,
    };
  },
  render() {
    return (
      <div class="container my-4">
        <button class="btn btn-link mb-3" style={{ textDecoration: "none" }} onClick={this.goBack}>
          <img src="/assets/img/left-arrow.png" alt="Back" style={{ height: "24px" }} />
        </button>

        <h2 class="mb-4 text-center">{this.$t("general.hasilrekap")}</h2>
        {this.submissionNotification && (
          <div class="alert alert-success" role="alert">
            {this.submissionNotification}
          </div>
        )}

        <div class="card p-4 shadow-sm mb-4">
          <div class="mb-3">
            <label class="form-label">Peserta</label>
            <input type="text" class="form-control" v-model={this.recapData.namapeserta} disabled />
          </div>
          <div class="mb-3">
            <label class="form-label">Penerima</label>
            <input type="text" class="form-control" v-model={this.recapData.namaPenyimak} disabled />
          </div>
          {this.setoranData?.tampilkan_type === "juz" ? (
            <div class="mb-3">
              <label class="form-label">Juz:</label>
              <vSelect
                v-model={this.selectedJuz}
                options={this.juzOptions}
                reduce={(option: { value: string }) => option.value}
                placeholder="Cari juz..."
                clearable={false}
                onInput={(val: string) => console.log("Debug: Juz selected:", val)}
              />
            </div>
          ) : (
            <>
              <div class="d-flex gap-3 mb-3">
                <div class="flex-grow-1">
                  <label class="form-label">Awal Surat:</label>
                  <vSelect
                    v-model={this.selectedStartSurah}
                    options={this.surahOptions}
                    placeholder="Cari surah..."
                    clearable={false}
                  />
                </div>
                <div class="flex-grow-1">
                  <label class="form-label">Awal Ayat:</label>
                  <vSelect
                    v-model={this.selectedStartVerse}
                    options={this.startVerseOptions}
                    placeholder="Cari ayat..."
                    clearable={false}
                  />
                </div>
              </div>
              <div class="d-flex gap-3 mb-3">
                <div class="flex-grow-1">
                  <label class="form-label">Akhir Surat:</label>
                  <vSelect
                    v-model={this.selectedEndSurah}
                    options={this.surahOptions}
                    placeholder="Cari surah..."
                    clearable={false}
                  />
                </div>
                <div class="flex-grow-1">
                  <label class="form-label">Akhir Ayat:</label>
                  <vSelect
                    v-model={this.selectedEndVerse}
                    options={this.endVerseOptions}
                    placeholder="Cari ayat..."
                    clearable={false}
                  />
                </div>
              </div>
            </>
          )}
          <div class="mb-3">
            <label class="form-label">Kesimpulan</label>
            <select class="form-select" style={{ maxWidth: "200px" }} v-model={this.recapData.kesimpulan}>
              <option value="" style={{ color: "grey" }}>
                Pilih Kesimpulan
              </option>
              <option value="Lancar">Lancar</option>
              <option value="Tidak Lancar">Tidak Lancar</option>
              <option value="Lulus">Lulus</option>
              <option value="Tidak Lulus">Tidak Lulus</option>
              <option value="Mumtaz">Mumtaz</option>
              <option value="Dhoif">Dhoif</option>
            </select>
          </div>
          <div class="mb-3">
            <label class="form-label">Catatan</label>
            <textarea
              class="form-control"
              v-model={this.recapData.catatan}
              placeholder="Catatan"
            ></textarea>
          </div>
          <div class="d-flex justify-content-end">
            <button
              class="btn btn-primary"
              onClick={this.submitRecap}
              disabled={this.isSubmitting}
            >
              {this.isSubmitting ? "Mengirim..." : "Kirim"}
            </button>
          </div>
        </div>
        {Object.entries(this.errorsByPage)
          .sort(([pageA], [pageB]) => parseInt(pageA) - parseInt(pageB))
          .map(([page, errors]: [string, { ayatSalah: MarkedError[]; kataSalah: MarkedError[] }]) => (
            <div key={page} class="card mb-3 shadow-sm">
              <div
                class="card-header d-flex align-items-center justify-content-between"
                style={{
                  background: "#d9edf7",
                  border: "none",
                  color: "#2C3E50",
                  cursor: "pointer",
                }}
                onClick={() => this.togglePanel(page)}
              >
                <h5
                  class="m-0"
                  style={{
                    color: "#31708f",
                  }}
                >
                  Halaman {page}
                </h5>
                <span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="34px"
                    height="34px"
                    viewBox="0 0 24 24"
                    style={{
                      transform: this.panels[page] ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.3s",
                      marginTop: "20px",
                      color: "#31708f",
                    }}
                  >
                    <g>
                      <path fill="none" d="M0 0h24v24H0z" />
                      <path
                        fill="currentColor"
                        d="M12 15l-4.243-4.243 1.415-1.414L12 12.172l2.828-2.829 1.415 1.414z"
                      />
                    </g>
                  </svg>
                </span>
              </div>
              <div class="card-body" v-show={this.panels[page]}>
                <div class="mb-3">
                  <h6>Kesalahan Ayat:</h6>
                  {errors.ayatSalah.length === 0 ? (
                    <p class="text-muted">Tidak ada kesalahan ayat.</p>
                  ) : (
                    <ul style={{ textAlign: "left", listStyleType: "none", padding: 0 }}>
                      {errors.ayatSalah.map((err, idx) => (
                        <li
                          key={`verse-${idx}`}
                          class="list-group-item"
                          style={{ borderBottom: "1px solid #ddd", padding: "7px 0" }}
                        >
                          <span style={{ fontWeight: "500", fontSize: "15px", marginRight: "5px" }}>
                            {idx + 1}.
                          </span>
                          <span
                            class="badge ms-2 me-1"
                            style={{
                              backgroundColor: this.getErrorColor(err.salahKey),
                              color: "#000",
                              borderWidth: "2px",
                              fontWeight: "500",
                              textAlign: "left",
                              fontSize: "15px",
                            }}
                          >
                            {err.NamaSurat} : {err.noAyat}
                          </span>
                          <span>{err.salah}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div class="mb-3">
                  <h6>Kesalahan Kata:</h6>
                  {errors.kataSalah.length === 0 ? (
                    <p class="text-muted">Tidak ada kesalahan kata.</p>
                  ) : (
                    <ul style={{ textAlign: "left", listStyleType: "none", padding: 0 }}>
                      {errors.kataSalah.map((err, idx) => (
                        <li
                          key={`word-${idx}`}
                          class="list-group-item"
                          style={{
                            borderBottom: "1px solid #ddd",
                            padding: "5px 0",
                          }}
                        >
                          <span style={{ fontWeight: "500", fontSize: "15px", marginRight: "5px" }}>
                            {idx + 1}.
                          </span>
                          <span
                            class="badge me-2"
                            style={{
                              backgroundColor: this.getErrorColor(err.salahKey),
                              color: "#000",
                              fontSize: "20px",
                              fontFamily: "'Scheherazade New', 'Amiri', serif",
                            }}
                          >
                            {this.decodeUnicode(err.kata?.text || "")}
                          </span>
                          <span>{err.salah}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div class="mb-3">
                  <h6>Kesimpulan</h6>
                  <select
                    class="form-select"
                    style={{ maxWidth: "200px" }}
                    v-model={this.pageConclusions[page]}
                  >
                    <option value="" style={{ color: "grey" }}>
                      Pilih Kesimpulan
                    </option>
                    <option value="Lancar">Lancar</option>
                    <option value="Tidak Lancar">Tidak Lancar</option>
                    <option value="Lulus">Lulus</option>
                    <option value="Tidak Lulus">Tidak Lulus</option>
                    <option value="Mumtaz">Mumtaz</option>
                    <option value="Dhoif">Dhoif</option>
                  </select>
                </div>
                <div class="mb-3">
                  <h6>Catatan</h6>
                  <textarea
                    class="form-control"
                    v-model={this.pageNotes[page]}
                    placeholder="Catatan khusus halaman ini"
                  ></textarea>
                </div>
              </div>
            </div>
          ))}
      </div>
    );
  },
});