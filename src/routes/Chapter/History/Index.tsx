import { defineComponent, Suspense, computed, ref, watch } from "vue";
import { useChapters } from "@/hooks/chapters";
import { useSettings } from "@/hooks/settings";
import { Chapters, Words } from "@/types";
import axios from "axios";
import ChapterLayout from "@/components/Layout/ChapterLayout";
import PageHistory from "./Verses";
import PageSkeleton from "../PageSkeleton";
import setPageTitle from "@/helpers/set-page-title";

interface SetoranData {
  info: string;
  perhalaman: string;
  kesalahan: string;
}

interface Kesalahan {
  salahKey: string;
  salah: string;
  NamaSurat: string;
  Page: number;
  noAyat: number;
  kata: {
    id: number;
    text: string;
  } | null;
}

export default defineComponent({
  setup() {
    const chapters = useChapters();
    const setting = useSettings();
    const root = ref<HTMLElement | null>(null);
    const page = ref<number>(0);
    const activeAyah = ref<number>(0);
    const setoranData = ref<SetoranData | null>(null);
    const verses = ref<Words[][]>([]);
    const kesalahan = ref<Kesalahan[]>([]);
    const errorColors = ref<Record<string, string>>({});
    const customLabels = ref<Record<string, string>>({});
    const isLoading = ref<boolean>(true);
    const errorMessage = ref<string>("");

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

    function loadSetoranData() {
      const data = localStorage.getItem("setoranData");
      if (data) {
        try {
          setoranData.value = JSON.parse(data);
          console.log("Index.tsx: Loaded setoranData:", setoranData.value);
          const parsedKesalahan = JSON.parse(setoranData.value.kesalahan);
          const ayatKesalahan = parsedKesalahan.ayatSalah.map((err: any) => ({
            salahKey: err.salahKey,
            salah: err.jenisKesalahan,
            NamaSurat: err.surah,
            Page: err.page,
            noAyat: err.ayat,
            kata: null,
          }));
          const kataKesalahan = Object.entries(parsedKesalahan.kataSalah).flatMap(([salah, data]: [string, any]) =>
            data.words.map((text: string, index: number) => ({
              salahKey: data.salahKey,
              salah,
              NamaSurat: setoranData.value?.info || "",
              Page: data.pages[index],
              noAyat: 0,
              kata: {
                id: data.ids[index],
                text: decodeUnicode(text),
              },
            }))
          );
          kesalahan.value = [...ayatKesalahan, ...kataKesalahan];
          console.log("Index.tsx: Loaded kesalahan:", kesalahan.value);
        } catch (error) {
          console.error("Index.tsx: Failed to parse setoranData:", error);
          errorMessage.value = "Failed to load setoran data";
          isLoading.value = false;
        }
      } else {
        console.error("Index.tsx: No setoranData in localStorage");
        errorMessage.value = "No setoran data found";
        isLoading.value = false;
      }
    }

    function loadErrorSettings() {
      const settings = localStorage.getItem("qurani_setting_global");
      if (settings) {
        try {
          const parsed = JSON.parse(settings);
          errorColors.value = parsed.errorColors || {};
          customLabels.value = parsed.customLabels || {};
          console.log("Index.tsx: Loaded error settings:", parsed);
        } catch (error) {
          console.error("Index.tsx: Failed to parse qurani_setting_global:", error);
        }
      }
    }

    async function fetchVerses() {
      if (!setoranData.value || !setoranData.value.perhalaman) {
        console.error("Index.tsx: No setoranData or perhalaman");
        errorMessage.value = "Missing setoran data or perhalaman";
        isLoading.value = false;
        return;
      }
      try {
        const perhalaman = JSON.parse(setoranData.value.perhalaman);
        console.log("Index.tsx: Parsed perhalaman:", perhalaman);
        const chapter = chapters.data.value.find((ch) => ch.name_simple === setoranData.value?.info);
        if (!chapter) {
          console.error("Index.tsx: Chapter not found for", setoranData.value.info);
          errorMessage.value = `Chapter not found: ${setoranData.value.info}`;
          isLoading.value = false;
          return;
        }
        const apiUrl = `http://127.0.0.1:8000/api/v1/verses/by_chapter/${chapter.id}?words=true`;
        console.log("Index.tsx: Fetching verses from:", apiUrl);
        const response = await axios.get(apiUrl);
        console.log("Index.tsx: API response:", response.data);
        verses.value = response.data.verses.map((verse: any) => verse.words);
        if (verses.value.length === 0) {
          console.warn("Index.tsx: No verses returned from API");
          errorMessage.value = "No verses found for this chapter";
        }
        kesalahan.value = kesalahan.value.map((err) => {
          if (err.kata && err.noAyat === 0) {
            const word = verses.value
              .flat()
              .find((w: Words) => w.id === err.kata!.id);
            if (word) {
              const verse = response.data.verses.find((v: any) =>
                v.words.some((w: Words) => w.id === err.kata!.id)
              );
              if (verse) {
                return { ...err, noAyat: verse.verse_number };
              }
            }
          }
          return err;
        });
        console.log("Index.tsx: Loaded verses:", verses.value);
        console.log("Index.tsx: Updated kesalahan:", kesalahan.value);
      } catch (error) {
        console.error("Index.tsx: Failed to fetch verses:", error);
        errorMessage.value = "Failed to fetch verses";
        isLoading.value = false;
      }
    }

    const chapter = computed<Chapters | null>(() => {
      if (setoranData.value) {
        console.log("Index.tsx: setoranData.info:", setoranData.value.info);
        console.log("Index.tsx: chapters.data.value:", chapters.data.value);
        const foundChapter = chapters.data.value.find((ch) => ch.name_simple === setoranData.value!.info);
        console.log("Index.tsx: foundChapter:", foundChapter);
        return foundChapter || null;
      }
      console.log("Index.tsx: setoranData is null");
      return null;
    });

    const startVerseNumber = computed(() => {
      if (setoranData.value && setoranData.value.perhalaman) {
        try {
          const perhalaman = JSON.parse(setoranData.value.perhalaman);
          console.log("Index.tsx: startVerseNumber perhalaman:", perhalaman);
          return perhalaman.ayat.awal || 1;
        } catch (error) {
          console.error("Index.tsx: Failed to parse perhalaman:", error);
        }
      }
      return 1;
    });

    function loaded(ctx: { firstPage: number }) {
      page.value = ctx.firstPage;
    }

    watch(chapter, (chapter) => {
      if (chapter) {
        setPageTitle(chapter.name_simple);
        isLoading.value = false;
      }
    }, { immediate: true });

    // Load data on mount
    loadSetoranData();
    loadErrorSettings();
    chapters.load().then(() => fetchVerses());

    return {
      chapter,
      root,
      page,
      activeAyah,
      loaded,
      verses,
      kesalahan,
      errorColors,
      customLabels,
      startVerseNumber,
      isLoading,
      errorMessage,
    };
  },
  render() {
    if (this.isLoading) {
      return <div>Loading...</div>;
    }
    if (this.errorMessage) {
      return <div>Error: {this.errorMessage}</div>;
    }
    if (!this.chapter) {
      return <div>Error: Chapter not found</div>;
    }
    return (
      <>
        <ChapterLayout
          chapter={this.chapter}
          page={this.page}
          activeAyah={this.activeAyah}
          onClickAyah={() => {
            // No-op for history view; clicking ayahs is not supported
          }}
        >
          <div ref="root">
            <Suspense>
              {{
                fallback: () => (
                  <PageSkeleton
                    key={this.chapter?.id || 0}
                    chapter={this.chapter}
                  />
                ),
                default: () => (
                  <PageHistory
                    key={this.chapter?.id || 0}
                    chapter={this.chapter}
                    verses={this.verses}
                    kesalahan={this.kesalahan}
                    errorColors={this.errorColors}
                    customLabels={this.customLabels}
                    startVerseNumber={this.startVerseNumber}
                    onLoaded={this.loaded}
                  />
                ),
              }}
            </Suspense>
          </div>
        </ChapterLayout>
      </>
    );
  },
});