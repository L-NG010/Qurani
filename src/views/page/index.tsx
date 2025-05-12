import { defineComponent, ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useChapters } from "@/hooks/chapters";
import { getVerseByPage } from "@/helpers/api";
import Verses from "./Verses";
import VersesSkeleton from "./VersesSkeleton";
import style from "./Style.module.scss";
import type { Verses as VersesType, Chapters } from "@/types";
import ChapterLayout from "@/components/Layout/ChapterLayout";

export default defineComponent({
  name: "PageView",
  props: {
    page: { type: Number, required: true }
  },
  setup(props) {
    const { t } = useI18n();
    const router = useRouter();

    const chaptersHook = useChapters();
    const loading = ref(true);
    const rawVerses = ref<VersesType[]>([]);
    const pagination = ref({ current_page: 1, total_pages: 1 });

    onMounted(async () => {
      try {
        // 1. Panggil method load tanpa cek chapters.value
        await chaptersHook.load(); // Pastikan method load() ada di hook

        // 2. Ambil data ayat setelah chapter siap
        const data = await getVerseByPage(props.page, "id", 226);
        rawVerses.value = data.verses;
        pagination.value = data.pagination;
      } catch (e) {
        console.error(e);
      } finally {
        loading.value = false;
      }
    });

    // Group ayat per chapter dengan error handling
    const versesByChapter = computed(() => {
      const map: Record<number, VersesType[]> = {};
      rawVerses.value.forEach(v => {
        const chapId = Number(v.verse_key.split(":")[0]);
        (map[chapId] ||= []).push(v);
      });

      return Object.entries(map)
        .map(([id, arr]) => {
          try {
            const chapter = chaptersHook.find(Number(id));
            return chapter ? { chapter, verses: arr } : null;
          } catch (e) {
            console.error(`Chapter ${id} not found`);
            return null;
          }
        })
        .filter(Boolean) as { chapter: Chapters; verses: VersesType[] }[];
    });

    const goPage = (p: number) => {
      router.push({ name: "page", params: { page: p } });
    };

    // Function to scroll to the top of the page
    const scrollToTop = () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const navHeader = computed(() => `Page ${props.page}`); // Example definition for navHeader

    const activeAyah = ref<number | undefined>(undefined); // Define activeAyah as a ref

    const handleClickAyah = (ayah: number) => {
      activeAyah.value = ayah;
    };

    const prevPageLabel = computed(() => t("prevPage")); // Define prevPageLabel
    const nextSurahLabel = computed(() => t("nextSurah")); // Define nextSurahLabel
    const backTopLabel = computed(() => t("backToTop")); // Define backTopLabel

    return {
      t,
      loading,
      versesByChapter,
      pagination,
      props,
      goPage,
      scrollToTop,
      navHeader, // Add navHeader to the returned properties
      activeAyah, // Return activeAyah
      nextSurahLabel, // Return nextSurahLabel
      backTopLabel, // Return backTopLabel
      prevPageLabel, // Return prevPageLabel
      handleClickAyah, // Return handleClickAyah
    };
  },
  render() {
    return (
      <ChapterLayout
        page={this.page}
        chapter={this.versesByChapter[0]?.chapter || { id: -1, name_simple: 'Loading...' } as Chapters}
        activeAyah={this.activeAyah}
        onClickAyah={this.handleClickAyah}
        // navTitle={this.navHeader}
      >
        <div class={style.container}>
          {this.loading ? (
            <VersesSkeleton />
          ) : (
            <div>
              {this.versesByChapter.map(({ chapter, verses }) => (
                <Verses
                  key={chapter.id}
                  chapter={chapter}
                  verses={verses}
                />
              ))}
            </div>
          )}
          {/* Page number in the middle */}
          <div class="w-full flex justify-center items-center my-4">
            <button
              class="text-xl text-blue-500 hover:underline focus:outline-none"
              onClick={() => this.goPage(this.pagination.current_page)}
            >
              {this.pagination.current_page}
            </button>
          </div>
          {/* Footer navigation buttons in the center and horizontal */}
          <div class="footer-nav flex justify-center items-center p-3"> {/* Menggunakan justify-center */}
            <button
              class="btn btn-outline-secondary mr-2"
              onClick={() => this.goPage(this.pagination.current_page - 1)}
              disabled={this.pagination.current_page <= 1}
            >
              {this.prevPageLabel}
            </button>
            <button
              class="btn btn-outline-secondary mx-2"
              onClick={this.scrollToTop}
            >
              {this.backTopLabel}
            </button>
            <button
              class="btn btn-outline-secondary ml-8"
              onClick={() => this.goPage(this.pagination.current_page + 1)}
              disabled={this.pagination.current_page >= this.pagination.total_pages}
            >
              {this.nextSurahLabel}
            </button>
          </div>
        </div>
      </ChapterLayout>
    );
  }
});