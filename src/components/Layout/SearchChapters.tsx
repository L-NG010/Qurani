import { computed, defineComponent, Transition, watch, ref, nextTick, onUnmounted } from "vue";
import { useLocalStorage } from "@/hooks/storage";
import { Chapters } from "@/types";
import styles from "./SearchChapters.module.scss";
import scroll from "@/helpers/scroll";
import Button from "@/components/Button/Button";
import collect from "collect.js";
import Tooltip from "../Tooltip/Tooltip";
import router from "@/routes";
import axios from "axios";

// Define the search result types
interface SearchResult {
  type: "surah" | "page" | "juz";
  id: number;
  name: string | string[];
}

export default defineComponent({
  emits: ["update:show"],
  props: {
    show: Boolean,
  },
  setup(props, { emit }) {
    const storage = useLocalStorage();
    const query = ref<string>("");
    const inputRef = ref<HTMLInputElement | null>(null);
    const isLoading = ref<boolean>(false);
    const hasSearched = ref<boolean>(false); // Tambahkan state untuk melacak status pencarian
    const apiResults = ref<SearchResult[]>([]);
    const searchTimeout = ref<number | null>(null);

    const shouldShow = computed<boolean>({
      set(value) {
        emit("update:show", value);
      },
      get() {
        return Boolean(props.show);
      },
    });

    const STORAGE_KEY = "CHAPTERS_FAV";

    // Function to fetch search results from API
    async function fetchSearchResults(searchQuery: string) {
      if (!searchQuery.trim()) {
        apiResults.value = [];
        hasSearched.value = false; // Reset hasSearched jika query kosong
        return;
      }

      isLoading.value = true;
      hasSearched.value = false; // Reset sebelum pencarian baru
      try {
        const response = await axios.get(
          `http://127.0.0.1:8000/api/v1/v2/search?q=${encodeURIComponent(searchQuery)}`
        );
        apiResults.value = response.data.results || [];
      } catch (error) {
        console.error("Error fetching search results:", error);
        apiResults.value = [];
      } finally {
        isLoading.value = false;
        hasSearched.value = true; // Tandai pencarian selesai
      }
    }

    // Combined search results from API
    const searchResults = computed(() => {
      return apiResults.value;
    });

    // Watch for query changes to trigger API search with 0.5-second delay
    watch(query, (newQuery) => {
      if (searchTimeout.value !== null) {
        window.clearTimeout(searchTimeout.value);
        searchTimeout.value = null;
      }

      if (newQuery.trim()) {
        searchTimeout.value = window.setTimeout(() => {
          fetchSearchResults(newQuery);
        }, 500);
      } else {
        apiResults.value = [];
        hasSearched.value = false; // Reset hasSearched saat query dikosongkan
      }
    });

    // Ambil data favorit dari local storage
    const favorite = computed<Chapters[]>(() => {
      const favoriteData = storage.get(STORAGE_KEY, {}) as Record<string, number>;
      const favoriteArray: [string, number][] = Object.keys(favoriteData).map((id) => [
        id,
        favoriteData[id],
      ]);
      return collect(favoriteArray)
        .sortByDesc((item: [string, number]) => item[1])
        .map(([id]: [string, number]) => {
          // Mock chapter data for favorites (replace with actual chapter lookup if needed)
          return { id: Number(id), name_simple: `Surah ${id}` } as Chapters;
        })
        .filter((item) => item !== undefined)
        .toArray() as Chapters[];
    });

    function isFavorite(id: number) {
      const favoriteData = storage.get(STORAGE_KEY, {}) as Record<string, number>;
      return Object.keys(favoriteData).map(Number).includes(id);
    }

    function deleteFavorite(id: number) {
      storage.set(STORAGE_KEY, (favoriteData: Record<string, number> = {}) => {
        const newData = { ...favoriteData };
        delete newData[String(id)];
        return newData;
      });
    }

    function addFavorite(id: number) {
      storage.set(STORAGE_KEY, (favoriteData: Record<string, number> = {}) => {
        if (isFavorite(id)) {
          delete favoriteData[String(id)];
        } else {
          const values = Object.values(favoriteData);
          favoriteData[String(id)] = values.length ? Math.max(...values) + 1 : 1;
        }
        return favoriteData;
      });
    }

    // Handle navigation based on result type
    function navigateToResult(result: SearchResult) {
      shouldShow.value = false; // Close modal after navigation
      switch (result.type) {
        case "surah":
          router.push({ name: "chapter", params: { id: result.id.toString() } });
          break;
        case "page":
          router.push({ name: "page", params: { page: result.id.toString() } });
          break;
        case "juz":
          router.push({ name: "juz", params: { id: result.id.toString() } });
          break;
        default:
          console.error("Unknown result type:", result.type);
      }
    }

    function gotoChapter(id: number) {
      shouldShow.value = false; // Close modal after navigation
      router.push({ name: "chapter", params: { id: id.toString() } });
    }

    watch(shouldShow, (show) => {
      show ? scroll.disable() : scroll.enable();
      if (show) {
        nextTick(() => inputRef.value?.focus());
      }
    }, { immediate: true });

    // Clean up timeout on component unmount
    onUnmounted(() => {
      if (searchTimeout.value !== null) {
        window.clearTimeout(searchTimeout.value);
      }
    });

    return {
      shouldShow,
      query,
      favorite,
      inputRef,
      gotoChapter,
      isFavorite,
      addFavorite,
      deleteFavorite,
      isLoading,
      hasSearched, // Tambahkan ke return
      searchResults,
      navigateToResult,
    };
  },
  render() {
    return (
      <Transition
        enterActiveClass={styles.animate_in}
        leaveActiveClass={styles.animate_out}
        onBeforeLeave={(el) => el.classList.remove(styles.blur)}
        onAfterEnter={(el) => el.classList.add(styles.blur)}
      >
        {this.shouldShow && (
          <div
            class={styles.container}
            onClick={(e) => {
              if ((e.target as HTMLElement).classList.contains(styles.card_container)) {
                this.shouldShow = false;
              }
            }}
          >
            <div class={styles.card_container}>
              <div class={["card", styles.card]}>
                <div class={["card-header d-flex justify-content-between", styles.card_header]}>
                  <div class="h-100 d-flex align-items-center">
                    <font-awesome-icon icon="search" />
                  </div>
                  <div class="w-100 me-3 ms-3 d-flex">
                    <div class="w-100">
                      <input
                        v-model={this.query}
                        placeholder={`/ ${this.$t("general.search-surah").toLowerCase()}`}
                        class={styles.search_input}
                        ref="inputRef"
                      />
                    </div>
                    {this.query.trim() && (
                      <div class="d-flex align-items-center">
                        <small
                          class={["text-uppercase text-muted", styles.clear_search]}
                          onClick={() => (this.query = "")}
                        >
                          {this.$t("general.clear")}
                        </small>
                      </div>
                    )}
                  </div>
                  <div class="h-100 d-flex align-items-center">
                    <button class="btn-close" onClick={() => (this.shouldShow = false)}></button>
                  </div>
                </div>
                <div class={["card-body custom-scrollbar", styles.card_body]}>
                  {!this.query.trim() ? (
                    <p class="font-monospace text-center">{this.$t("search.type-to-search")}</p>
                  ) : this.isLoading ? (
                    <div class="text-center py-4">
                      <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                      </div>
                      <p class="mt-2">Mencari...</p>
                    </div>
                  ) : this.searchResults.length > 0 ? (
                    <div class="mb-4">
                      <h6 class="heading-small mb-3">Hasil Pencarian untuk "{this.query}"</h6>
                      {this.searchResults.map((result, index) => (
  <div
    key={`result-${index}`}
    class={[styles.search_result, 'd-flex justify-content-between align-items-center mb-2']}
    onClick={() => this.navigateToResult(result)}
  >
    <div class="w-100 h-100">
      <div class="d-flex align-items-center">
        <div class={[styles.result_type, `${styles[result.type]}`]}>
          <font-awesome-icon
            icon={result.type === 'juz' ? 'book' : result.type === 'page' ? 'file' : 'quran'}
            class={styles.result_icon}
          />
          <span class={styles.result_label}>
            {result.type === 'surah' ? 'Surah' : result.type === 'page' ? 'Page' : 'Juz'}
          </span>
        </div>
        <div class="ms-3">
          <div class="fw-bold">{result.id}</div>
          <div class="small">
            {result.type === 'juz' ? `Juz ${result.id}` : Array.isArray(result.name) ? result.name.join(', ') : result.name}
          </div>
        </div>
      </div>
    </div>
  </div>
))}
                    </div>
                  ) : this.hasSearched ? (
                    <div>
                      <div class="d-flex justify-content-center mb-2">
                        <img
                          src="/assets/svg/undraw_no_data_re_kwbl.svg"
                          class="img-fluid"
                          width="100"
                          height="100"
                        />
                      </div>
                      <p class="font-monospace text-center">{this.$t("search.no-result")}</p>
                    </div>
                  ) : null}
                  {/* Favorites Section */}
                  {this.favorite.length > 0 && !this.query.trim() && (
                    <div class="mt-3 mb-3">
                      <h6 class="heading-small text-center">
                        {this.$t("general.favorite")} ({this.favorite.length})
                      </h6>
                      <hr />
                      {this.favorite.map((item) => (
                        <div
                          key={item.id}
                          class={[styles.chapter, "d-flex justify-content-between align-items-center"]}
                        >
                          <span class="w-100 h-100" onClick={() => this.gotoChapter(item.id)}>
                            {item.name_simple}
                          </span>
                          <Tooltip
                            title={this.$t("general.delete-from-favorite")}
                            options={{ container: "." + styles.card }}
                          >
                            <Button size="sm" type="primary" onClick={() => this.deleteFavorite(item.id)}>
                              <font-awesome-icon icon="star" />
                            </Button>
                          </Tooltip>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </Transition>
    );
  },
});