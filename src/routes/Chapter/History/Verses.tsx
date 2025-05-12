import { defineComponent, computed, ref, PropType, onMounted, h, onBeforeUnmount } from "vue";
import { useSettings } from "@/hooks/settings";
import { Chapters, Words } from "@/types";
import { useIntersectionObserver } from "@vueuse/core";
import ArabicTextRiwayat from "@/components/QuranReader/ArabicTextRiwayat";
import Skeleton from "@/components/Skeleton/Skeleton";

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

type DataVerse = {
  verse_number: number;
  words: Words[];
  highlight: boolean | number;
};

export default defineComponent({
  inheritAttrs: false,
  props: {
    verses: {
      type: Array as PropType<Words[][]>,
      required: true,
    },
    chapter: {
      type: Object as PropType<Chapters>,
      required: true,
    },
    kesalahan: {
      type: Array as PropType<Kesalahan[]>,
      required: true,
    },
    errorColors: {
      type: Object as PropType<Record<string, string>>,
      required: true,
    },
    customLabels: {
      type: Object as PropType<Record<string, string>>,
      required: true,
    },
    startVerseNumber: {
      type: Number,
      required: true,
    },
    onLoaded: {
      type: Function as PropType<(data: { firstPage: number }) => void>,
      required: true,
    },
  },
  setup(props, { expose }) {
    const el = ref<HTMLElement | null>(null);
    const visible = ref<boolean>(true); // Hardcode for debugging
    const size = ref<number>(0);
    const setting = useSettings();

    const data = computed<DataVerse[]>(() => {
      console.log("Verses.tsx: props.verses:", props.verses);
      return props.verses.map((words, index) => ({
        verse_number: index + props.startVerseNumber,
        words,
        highlight: false, // No dynamic highlighting for history view
      }));
    });

    const key = computed<string>(() => {
      return data.value.map((verse) => `${props.chapter.id}:${verse.verse_number}`).join(",");
    });

    function getKey() {
      return key.value;
    }

    function setVisible(value: boolean) {
      visible.value = value;
    }

    function setSize(value: number) {
      if (el.value && visible.value) {
        size.value = value + 10;
      }
    }

    function renderItem(verse: DataVerse, index: number) {
      const attribute = {
        showTooltipWhenHighlight: false,
        showTransliterationInline: false, // Disable for debugging
        showTransliterationTooltip: false,
        showTranslationInline: false,
        showTranslationTooltip: false,
        kesalahan: props.kesalahan,
        errorColors: props.errorColors,
        customLabels: props.customLabels,
      };

      const children = (
        <ArabicTextRiwayat
          key={verse.verse_number}
          chapterId={props.chapter.id}
          verseNumber={verse.verse_number}
          words={verse.words}
          highlight={verse.highlight}
          enableHover={true}
          buttons={[]} // No buttons for history view
          {...attribute}
        />
      );

      return h("span", {
        "data-verse-key": `${props.chapter.id}:${verse.verse_number}`,
        "key": index,
      }, children);
    }

    const observer = ref<ResizeObserver | null>(null);

    onMounted(() => {
      if (el.value) {
        setSize(el.value.offsetHeight);
        const wrapper = el.value.querySelector("[data-id='wrapper']") as HTMLElement;
        if (wrapper) {
          observer.value = new ResizeObserver(() => {
            if (el.value) {
              const wrapper = el.value.querySelector("[data-id='wrapper']") as HTMLElement;
              if (wrapper) {
                setSize(wrapper.offsetHeight);
              }
            }
          });
          observer.value.observe(wrapper);
        }
        props.onLoaded({ firstPage: props.verses[0]?.[0]?.page_number || 1 });
      }
    });

    onBeforeUnmount(() => {
      if (observer.value && el.value) {
        const wrapper = el.value.querySelector("[data-id='wrapper']") as HTMLElement;
        if (wrapper) {
          observer.value.unobserve(wrapper);
          observer.value.disconnect();
        }
      }
    });

    useIntersectionObserver(
      el,
      ([{ isIntersecting }]) => {
        console.log("Verses.tsx: IntersectionObserver isIntersecting:", isIntersecting);
        requestAnimationFrame(() => {
          visible.value = isIntersecting;
        });
      },
      {
        rootMargin: "600px",
        threshold: [0.2, 0.25, 0.5, 0.75, 1.0],
      }
    );

    expose({
      getKey,
      setVisible,
    });

    return {
      el,
      key,
      size,
      visible,
      data,
      renderItem,
    };
  },
  render() {
    if (!this.data.length) {
      return <div>No verses to display</div>;
    }
    return (
      <div data-verse-keys={this.key} style={{ minHeight: `${this.size}px` }} ref="el">
        <div data-id="wrapper">
          {this.visible ? this.data.map(this.renderItem) : (
            <Skeleton
              width="100%"
              height={`${this.size}px`}
              borderRadius="10px"
            />
          )}
        </div>
      </div>
    );
  },
});