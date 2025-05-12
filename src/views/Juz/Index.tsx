import { getChapterInfo, getVerseByChapter, makeUrl } from "@/helpers/api";
import { useHttpRetry } from "@/hooks/http";
import { useSettings } from "@/hooks/settings";
import { defineComponent, Suspense, computed, ref, watch, nextTick, Fragment } from "vue";
import { useRoute } from "vue-router";
import { useChapters } from "@/hooks/chapters";
import { useQuranReader } from "@/hooks/quran-reader";
import { Chapters, LocaleCode, Juzs } from "@/types";
import { useDebounceFn, useMemoize, useScroll } from "@vueuse/core";
import { useAudioPlayer } from "@/hooks/audio-player";
import ChapterLayout from "@/components/Layout/ChapterLayout";
import PageSkeleton from "./PageSkeleton";
import Page from "./Page";
import isElementInViewport from "@/helpers/is-element-in-viewport";
import setPageTitle from "@/helpers/set-page-title";


export default defineComponent({
    setup() {
        const route = useRoute();
        const chapters = useChapters();
        const setting = useSettings();
        const httpRetry = useHttpRetry();
        const refs = ref<any>(null);
        const root = ref<HTMLElement | null>(null);
        const activeAyah = ref<number>(0);
        const page = ref<number>(0);
        const juzData = ref<(Juzs & { chapters: Chapters[] })[]>([]);
        const { activeTimestamp, isPlaying, isAutoScroll, audioId } = useAudioPlayer();
        const { y } = useScroll(window);
        const highlightVerse = ref<string | null>(null);


        const juzId = computed<number>(() => {
            return Number(route.params.id);
        });

        const keys = computed<string>(() => {
            return [
                juzId.value,
                setting.locale.value
            ].toString();
        });
        

        const loadJuzData = async () => {
            const response = await httpRetry.get<{ juzs: Juzs[] }>(makeUrl("juzs"));
            const juzs = response.data.juzs;

            const currentJuz = juzs.find(juz => juz.id === juzId.value);
            if (currentJuz) {
                juzData.value = [{
                    ...currentJuz,
                    chapters: Object.keys(currentJuz.verse_mapping)
                        .map(id => chapters.find(Number(id)))
                        .filter(item => item !== null) as Chapters[]
                }];
            }
        };

        const getters = {
            VERSE: useMemoize(async(id: number, locale: LocaleCode) => {
                return await httpRetry.promise(getVerseByChapter(id, locale));
            }),
            INFO: useMemoize(async(id: number, locale: LocaleCode) => {
                return await httpRetry.promise(getChapterInfo(id, locale));
            })
        }

        function loaded(ctx: { firstPage: number }) {
            page.value = ctx.firstPage;
        }

        const resetHighlightVerse = useDebounceFn(() => {
            highlightVerse.value = null;
        }, 2000);

        function handleClickAyah(ayah: number) {
            refs.value?.scrollToVerse(ayah).then(() => {
                highlightVerse.value = [juzId.value, ayah].join(":");
                nextTick(resetHighlightVerse);
            });
        }

        watch(y, () => {
            const pages: HTMLElement[] = Array.from(root.value?.querySelectorAll("[data-page]") || []);
            const verse: HTMLElement[] = Array.from(root.value?.querySelectorAll("[data-verse-key]") || []);
            
            const currentPage = pages.find(
                el => isElementInViewport(el, true)
            );

            const currentVerse = verse.find(
                el => isElementInViewport(el)
            );

            if (currentPage) {
                page.value = Number(currentPage.dataset.page)
            }

            if (currentVerse) {
                activeAyah.value = Number(currentVerse.dataset.verseKey?.split(":").pop());
            }
        });

        watch([activeTimestamp, isAutoScroll, isPlaying], ([activeTimestamp, isAutoScroll, isPlaying]) => {
            if (activeTimestamp && isAutoScroll && isPlaying && refs.value) {
                if (audioId.value === juzId.value) {
                    const ayah = Number(activeTimestamp.verse_key.split(":").pop());
                    refs.value.scrollToVerse(ayah).then(() => {
                        // console.debug("scroll position", y.value)
                    }).catch(() => {
                        highlightVerse.value = null;
                    });
                }
            }
        });

        watch(juzData, (juz) => {
            if (juz.length) setPageTitle(`Juz ${juz[0].juz_number}`);
        }, { immediate: true })

        loadJuzData();

        return {
            juzId,
            juzData,
            keys,
            getters,
            refs,
            root,
            page,
            activeAyah,
            loaded,
            handleClickAyah
        }
    },
    render() {
        return (
            <Fragment>
            
    
                {this.juzData.map(juz => (
                    <Fragment key={juz.id}>
                        {juz.chapters.map((chapter, index) => (
                            <ChapterLayout
                                key={`${juz.id}-${chapter.id}`}
                                chapter={chapter}
                                page={this.page}
                                activeAyah={this.activeAyah}
                                onClickAyah={this.handleClickAyah}
                                classNav={index === 0 ? "" : "d-none"}
                                // classFooter={index === juz.chapters.length - 1 ? "" : "d-none"}
                            >
                                <div ref="root">
                                    <Suspense key={this.keys}>
                                        {{
                                            fallback: () => (
                                                <PageSkeleton
                                                    key={this.juzId}
                                                    chapter={chapter}
                                                />
                                            ),
                                            default: () => (
                                                <Page
                                                    key={this.juzId}
                                                    chapter={[chapter]}
                                                    getters={this.getters}
                                                    onLoaded={this.loaded}
                                                    ref="refs"
                                                    juzNumber={juz.juz_number}
                                                />
                                            )
                                        }}
                                    </Suspense>
                                </div>
                            </ChapterLayout>
                        ))}
                    </Fragment>
                ))}
            </Fragment>
        )
    }
});