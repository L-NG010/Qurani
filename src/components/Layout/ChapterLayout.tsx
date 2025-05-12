import { PropType, defineComponent, Transition, ref, computed, watch, nextTick, onMounted } from "vue";
import { Chapters } from "@/types";
import { useToggle } from "@vueuse/core";
import { useChapters } from "@/hooks/chapters";
import MainLayout from "./MainLayout";
import { useRouter } from "vue-router";
import styles from "./QuranLayout.module.scss";
import Input from "../Input/Input";
import { useQuranReader } from "@/hooks/quran-reader";

export default defineComponent({
  emits: {
    clickAyah: (ayah: number) => true
  },
  props: {
    chapter: {
      type: Object as PropType<Chapters>,
      required: true
    },
    page: {
      type: Number,
      required: true
    },
    activeAyah: {
      type: Number
    },
    classNav: {
      type: String,
      default: "",
    },
    classFooter: {
      type: String,
      default: "",
    },
    class: {
      type: String,
      default: "",
    },
  },
  setup(props) {
    const [show, toggle] = useToggle<boolean>(false);
    const chapters = useChapters();
    const search = ref<{ chapter: string, ayah: number | null }>({ chapter: "", ayah: null });
    const root = ref<HTMLElement | null>(null);
    const router = useRouter(); 
    const { translateMode } = useQuranReader();

    // Ketika tombol SELESAI ditekan, kirim nilai awal halaman lewat query
    const handleClick = () => {
      router.push({ path: '/Rekapan', query: { page: props.page.toString() } });
    };

    const versesNumber = computed<number[]>(() => {
      return Array(props.chapter.verses_count).fill(0).map((_, index) => index + 1);
    });

    const filteredChapters = computed<Chapters[]>(() => {
      return chapters.search(search.value.chapter.trim());
    });

    const filteredAyah = computed<number[]>(() => {
      return (search.value.ayah !== null && String(search.value.ayah).trim())
        ? versesNumber.value.filter(number => String(number).includes(String(search.value.ayah)))
        : versesNumber.value;
    });

    // Jika terdapat activeAyah atau perubahan tampilan, scroll ke posisi yang sesuai
    watch(() => [props.activeAyah, show.value].toString(), () => {
      nextTick(() => {
        if (props.activeAyah && root.value) {
          const wrapper = root.value.querySelector("[data-name='ayah']");
          if (wrapper) {
            const el = wrapper.querySelector(`[data-ayah="${props.activeAyah}"]`);
            if (el) {
              wrapper.scrollTop = (el as HTMLElement).offsetTop - 400;
            }
          }
        }
      });
    });

    watch(() => [props.chapter.id, show.value].toString(), () => {
      nextTick(() => {
        if (props.chapter.id && root.value) {
          const wrapper = root.value.querySelector("[data-name='chapter']");
          if (wrapper) {
            const el = wrapper.querySelector(`[data-chapter-id='${props.chapter.id}']`);
            if (el) {
              wrapper.scrollTop = (el as HTMLElement).offsetTop - 400;
            }
          }
        }
      });
    });

    // --- Bagian Penentuan Range Halaman ---
    // Misalnya, untuk surah "Attur" range halamannya adalah 523 sampai 525.
    // Jika surah lain, kita bisa mengembalikan range default hanya satu halaman (props.page).
    const pageRange = computed<number[]>(() => {
  // Untuk chapter "Attur", range sudah ditentukan
  if (props.chapter.name_simple === "Attur") {
    return [523, 524, 525];
  }
  // Jika ada data range halaman di objek chapter
  if (props.chapter.pages && Array.isArray(props.chapter.pages)) {
    // Jika chapter.pages hanya memiliki dua angka (misal: [440, 445]),
    // maka buat array dari angka pertama sampai angka kedua
    if (props.chapter.pages.length === 2) {
      const start = props.chapter.pages[0];
      const end = props.chapter.pages[1];
      const fullRange: number[] = [];
      for (let i = start; i <= end; i++) {
        fullRange.push(i);
      }
      return fullRange;
    }
    // Jika chapter.pages sudah merupakan array lengkap, kembalikan langsung
    return props.chapter.pages;
  }
  // Fallback: jika tidak ada data halaman, gunakan props.page
  return [props.page];
});

    // Simpan range halaman, halaman awal, dan halaman akhir ke localStorage
    onMounted(() => {
      const pages = pageRange.value;
      if (pages && pages.length > 0) {
        localStorage.setItem("pageRange", JSON.stringify(pages));
        localStorage.setItem("startPage", pages[0].toString());
        localStorage.setItem("endPage", pages[pages.length - 1].toString());
      }
    });
    // --- End Range Halaman ---

    return {
      show,
      toggle,
      search,
      filteredChapters,
      filteredAyah,
      root,
      handleClick,
      translateMode
    };
  },
 // Bagian render yang sudah dimodifikasi
render() {
  return (
    <MainLayout 
      showScrollIndicator 
      fixed 
      class={this.class}
      showNavbar={!this.classNav.includes('d-none')}
      showFooter={!this.classFooter.includes('d-none')}
    >
      {{
        navSection: () => (
          <div class="ps-2 pe-2">
            <div class="d-flex justify-content-between align-items-center mt-3 mb-3">
              <div class="d-flex align-items-center">
                <router-link to="/">
                  <font-awesome-icon icon="home" style={{ fontSize: "18px" }} />
                </router-link>
                <span class="ms-1">
                  / {this.$t("quran-reader.nav-header", { page: this.page })}
                </span>
              </div>
              {this.translateMode === "read" && (
                <div 
                  class="d-flex justify-content-center align-items-center cursor-pointer w-[5%] text-center p-[5px]"
                  onClick={this.handleClick}
                >
                 <span class="text-white fw-bold px-3 py-1 rounded" style="background-color: #ff6500;">
  SELESAI
</span>

                </div>
              )}
              <div class="cursor-pointer d-flex align-items-center" onClick={() => this.toggle()}>
                <span>{this.chapter.name_simple}</span>
                <font-awesome-icon icon={this.show ? "caret-up" : "caret-down"} class="ms-2" />
              </div>
            </div>
          </div>
        ),
        footer: () => (
          <Transition
            enterActiveClass={styles.animate_in}
            leaveActiveClass={styles.animate_out}
            onBeforeLeave={(el) => {
              el.classList.remove(styles.active);
            }}
            onAfterEnter={(el) => {
              el.classList.add(styles.active);
            }}
          >
            {this.show && (
              <div ref="root" class={styles.container} onClick={(e: Event) => {
                if ((e.target as HTMLElement).classList.contains(styles.card_container)) {
                  this.show = false;
                }
              }}>
                <div class={styles.card_container}>
                  <div class={["card", styles.card]}>
                    <div class={["card-header d-flex justify-content-between", styles.card_header]}>
                      <h4 class="card-title">{this.chapter.name_simple}</h4>
                      <div class="h-100 d-flex align-items-center">
                        <button class="btn-close" onClick={() => this.show = false} aria-label="Close"></button>
                      </div>
                    </div>
                    <div class="card-body">
                      {/* Ubah row agar hanya ada satu kolom untuk pencarian surah */}
                      <div class="row border-top">
                        <div class="col-12">
                          <div class="mb-4 mt-3">
                            <Input
                              class="text-center"
                              
                              v-model={this.search.chapter}
                              {...{ placeholder: this.$t("general.search-surah") }}
                            />
                          </div>
                          <div class={["hide-scrollbar", styles.list_items]} data-name="chapter">
                            {this.filteredChapters.length > 0 ? (
                              <div class="list-group">
                                {this.filteredChapters.map(chapter => (
                                  <div
                                    key={chapter.id}
                                    data-chapter-id={chapter.id}
                                    
                                    class={["list-group-item list-group-item-action border-0", styles.item]}
                                    onClick={() => {
                                      this.$router.push({ name: "chapter", params: { id: chapter.id } });
                                    }}
                                  >
                                    <span class={"me-1 fw-bold"}>{chapter.id}</span>
                                    <span class="ms-1">{chapter.name_simple}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p class="font-monospace text-center">
                                {this.$t("general.no-surah-to-display")}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Transition>
        ),
        default: this.$slots.default
      }}
    </MainLayout>
  );
}
});