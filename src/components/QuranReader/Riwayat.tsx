import { defineComponent, ref, computed, onMounted, reactive } from "vue";
import vSelect from "vue-select";
import "vue-select/dist/vue-select.css";
import toast from "@/lib/toast";
import { useChapters } from "@/hooks/chapters";
import { useJuzs } from "@/hooks/juzs";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Jakarta");

interface Kesalahan {
  ayatSalah: Array<{
    surah: string;
    ayat: number;
    jenisKesalahan: string;
    salahKey: string;
    page?: number;
  }>;
  kataSalah: Record<string, {
    count: number;
    words: string[];
    salahKey: string;
    pages?: number[];
    ids?: number[];
    page?: number;
  }>;
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
  name: "Riwayat",
  components: { vSelect },
  setup() {
    const setoranData = ref<SetoranData | null>(null);
    const kesalahan = ref<Kesalahan>({ ayatSalah: [], kataSalah: {} });
    const errorColors = ref<Record<string, string>>({});
    const customLabels = ref<Record<string, string>>({});
    const errorKeysOrder = ref<string[]>([]);
    const errorTypes = ref<Record<string, string>>({});
    const panels = ref<Record<string, boolean>>({});
    const chapters = useChapters();
    const juzs = useJuzs();
    const selectedStartVerse = ref<number>(1);
    const selectedEndVerse = ref<number>(1);
    const selectedStartSurah = ref<string>("");
    const selectedEndSurah = ref<string>("");
    const selectedJuz = ref<string>("");
    const recapData = reactive({
      namaPenyimak: "",
      kesimpulan: "",
      catatan: "",
      namapeserta: "",
      surahDibaca: "",
      awalHalaman: "",
      akhirHalaman: "",
    });
    const pageConclusions = reactive<Record<string, string>>({});
    const pageNotes = reactive<Record<string, string>>({});

    const defaultColorMap: Record<string, string> = {
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

    function decodeUnicode(str: string | undefined | null): string {
      if (typeof str !== "string") return "";
      return str.replace(/\\u([\dA-Fa-f]{4})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      );
    }

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
      console.log("Riwayat.tsx: Initialized page data:", { pageConclusions, pageNotes, panels: panels.value });
    }

    function loadErrorSettings() {
      const settings = localStorage.getItem("qurani_setting_global");
      if (settings) {
        try {
          const parsed = JSON.parse(settings);
          errorColors.value = parsed.errorColors || {};
          customLabels.value = parsed.customLabels || {};
          errorKeysOrder.value = parsed.errorKeysOrder || [];
          errorTypes.value = parsed.errorTypes || {};
          console.log("Riwayat.tsx: Loaded error settings:", parsed);
        } catch (error) {
          console.error("Riwayat.tsx: Failed to parse qurani_setting_global:", error);
          toast.error("Gagal memuat pengaturan kesalahan.");
        }
      }
    }

    function loadFormData() {
      const data = localStorage.getItem("setoranData");
      if (data) {
        try {
          const parsed = JSON.parse(data);
          setoranData.value = {
            user_name: parsed.penyetor_name || "",
            penyimak_name: parsed.penerima_name || "",
            surat_id: parsed.nomor ? Number(parsed.nomor) : undefined,
            surat_name: parsed.info || "",
            juz_id: parsed.juz_id || "",
            halaman: parsed.halaman || "",
            tampilkan_type: parsed.tampilan || "surat",
            setoran_type: parsed.setoran || "tahfidz",
          };
          recapData.namapeserta = parsed.penyetor_name || "";
          recapData.namaPenyimak = parsed.penerima_name || "";
          recapData.kesimpulan = parsed.hasil || "";
          recapData.catatan = parsed.ket || "";
          recapData.surahDibaca = parsed.info || "";
          selectedStartSurah.value = parsed.info || "";
          selectedEndSurah.value = parsed.info || "";
          if (parsed.perhalaman) {
            const perhalaman = JSON.parse(parsed.perhalaman);
            recapData.awalHalaman = perhalaman.awal_halaman || "";
            recapData.akhirHalaman = perhalaman.akhir_halaman || "";
            selectedStartVerse.value = perhalaman.ayat?.awal || 1;
            selectedEndVerse.value = perhalaman.ayat?.akhir || 1;
            Object.assign(pageConclusions, perhalaman.conclusions || {});
            Object.assign(pageNotes, perhalaman.catatanPerhalaman || {});
            initializePageData(parseInt(recapData.awalHalaman), parseInt(recapData.akhirHalaman));
          }
          if (parsed.kesalahan) {
            try {
              kesalahan.value = JSON.parse(parsed.kesalahan);
            } catch (error) {
              console.error("Riwayat.tsx: Failed to parse kesalahan:", error);
              kesalahan.value = { ayatSalah: [], kataSalah: {} };
            }
          }
          if (setoranData.value?.tampilkan_type === "juz" && setoranData.value.juz_id) {
            selectedJuz.value = setoranData.value.juz_id;
          }
          console.log("Riwayat.tsx: Loaded setoranData:", setoranData.value);
          console.log("Riwayat.tsx: Loaded recapData:", recapData);
        } catch (error) {
          console.error("Riwayat.tsx: Failed to parse setoranData:", error);
          toast.error("Gagal memuat data setoran.");
        }
      }
    }

    onMounted(() => {
      loadErrorSettings();
      loadFormData();
      chapters.load();
      juzs.load();
    });

    const surahOptions = computed(() => {
      return chapters.data.value.map((ch) => ch.name_simple);
    });

    const juzOptions = computed(() => {
      return juzs.data.value.map((juz) => ({
        label: `Juz ${juz.juz_number}`,
        value: juz.juz_number.toString(),
      }));
    });

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

    const errorsByPage = computed(() => {
      const pages: Record<number, { ayatSalah: any[]; kataSalah: any[] }> = {};
      const start = parseInt(recapData.awalHalaman) || 1;
      const end = parseInt(recapData.akhirHalaman) || start;

      const allPages = new Set<number>();
      for (let p = start; p <= end; p++) allPages.add(p);
      kesalahan.value.ayatSalah.forEach((err) => {
        if (err.page) allPages.add(err.page);
      });
      Object.values(kesalahan.value.kataSalah).forEach((data) => {
        if (data.pages) data.pages.forEach((p: number) => allPages.add(p));
        if (data.page) allPages.add(data.page);
      });

      allPages.forEach((p) => {
        pages[p] = { ayatSalah: [], kataSalah: [] };
      });

      console.log("Riwayat.tsx: Initialized pages:", Object.keys(pages));

      const sortedAyatSalah = [...kesalahan.value.ayatSalah].sort((a, b) => {
        const indexA = errorKeysOrder.value.indexOf(a.salahKey);
        const indexB = errorKeysOrder.value.indexOf(b.salahKey);
        return (indexA === -1 ? Infinity : indexA) - (indexB === -1 ? Infinity : indexB);
      });

      sortedAyatSalah.forEach((err) => {
        const page = err.page && !isNaN(err.page) ? err.page : start;
        if (!pages[page]) pages[page] = { ayatSalah: [], kataSalah: [] };
        pages[page].ayatSalah.push({
          salahKey: err.salahKey,
          NamaSurat: err.surah,
          noAyat: err.ayat,
          salah: customLabels.value[err.salahKey] || err.jenisKesalahan,
        });
        console.log(`Riwayat.tsx: Added ayatSalah to page ${page}:`, err);
      });

      const sortedKataSalahEntries = Object.entries(kesalahan.value.kataSalah).sort(
        ([keyA, dataA], [keyB, dataB]) => {
          const indexA = errorKeysOrder.value.indexOf(dataA.salahKey);
          const indexB = errorKeysOrder.value.indexOf(dataB.salahKey);
          return (indexA === -1 ? Infinity : indexA) - (indexB === -1 ? Infinity : indexB);
        }
      );

      sortedKataSalahEntries.forEach(([key, data]) => {
        data.words.forEach((word, index) => {
          const page =
            data.pages && data.pages[index] !== undefined && !isNaN(data.pages[index])
              ? data.pages[index]
              : data.page && !isNaN(data.page)
              ? data.page
              : start;
          if (!pages[page]) pages[page] = { ayatSalah: [], kataSalah: [] };
          pages[page].kataSalah.push({
            salahKey: data.salahKey,
            kata: { text: word },
            salah: customLabels.value[data.salahKey] || key,
          });
          console.log(`Riwayat.tsx: Added kataSalah to page ${page}:`, { key, word });
        });
      });

      console.log("Riwayat.tsx: Final errorsByPage output:", pages);
      return pages;
    });

    const getErrorColor = (salahKey: string): string => {
      return errorColors.value[salahKey] || defaultColorMap[salahKey] || "#6c757d";
    };

    const togglePanel = (page: string) => {
      panels.value[page] = !panels.value[page];
      console.log(`Riwayat.tsx: Toggled panel for page ${page}:`, panels.value[page]);
    };

    function goBack() {
      window.top.location.href = "http://localhost/qurani";
    }

    function getDetailUrl() {
      if (setoranData.value?.tampilkan_type === "juz" && setoranData.value.juz_id) {
        return `http://localhost:5173/juz/${setoranData.value.juz_id}`;
      } else if (setoranData.value?.surat_id) {
        return `http://localhost:5173/riwayat/surah/${setoranData.value.surat_id}`;
      }
      return "http://localhost:5173/surah/1"; // Fallback
    }

    return {
      recapData,
      errorsByPage,
      getErrorColor,
      decodeUnicode,
      panels,
      togglePanel,
      setoranData,
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
      pageConclusions,
      pageNotes,
      goBack,
      getDetailUrl,
    };
  },
  render() {
    return (
      <div class="container my-4">
        <button class="btn btn-link mb-3" style={{ textDecoration: "none" }} onClick={this.goBack}>
          <img src="/assets/img/left-arrow.png" alt="Back" style={{ height: "24px" }} />
        </button>

        <h2 class="mb-4 text-center">{this.$t("general.hasilrekap")}</h2>

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
                disabled
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
                    disabled
                  />
                </div>
                <div class="flex-grow-1">
                  <label class="form-label">Awal Ayat:</label>
                  <vSelect
                    v-model={this.selectedStartVerse}
                    options={this.startVerseOptions}
                    placeholder="Cari ayat..."
                    clearable={false}
                    disabled
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
                    disabled
                  />
                </div>
                <div class="flex-grow-1">
                  <label class="form-label">Akhir Ayat:</label>
                  <vSelect
                    v-model={this.selectedEndVerse}
                    options={this.endVerseOptions}
                    placeholder="Cari ayat..."
                    clearable={false}
                    disabled
                  />
                </div>
              </div>
            </>
          )}
          <div class="mb-3">
            <label class="form-label">Kesimpulan</label>
            <select class="form-select" style={{ maxWidth: "200px" }} v-model={this.recapData.kesimpulan} disabled>
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
              disabled
            ></textarea>
          </div>
          <div class="d-flex justify-content-end">
            <button
              class="btn btn-info"
              onClick={() => (window.location.href = this.getDetailUrl())}
            >
              Lebih Lengkap
            </button>
          </div>
        </div>
        {Object.entries(this.errorsByPage)
          .sort(([pageA], [pageB]) => parseInt(pageA) - parseInt(pageB))
          .map(([page, errors]: [string, { ayatSalah: any[]; kataSalah: any[] }]) => (
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
                <h5 class="m-0" style={{ color: "#31708f" }}>
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
                          <span
                            style={{ fontWeight: "500", fontSize: "15px", marginRight: "5px" }}
                          >
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
                          <span
                            style={{ fontWeight: "500", fontSize: "15px", marginRight: "5px" }}
                          >
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
                    disabled
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
                    disabled
                  ></textarea>
                </div>
              </div>
            </div>
          ))}
      </div>
    );
  },
});