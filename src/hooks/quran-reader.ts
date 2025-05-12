import { createGlobalState } from "@vueuse/core";
import { computed, ref, Ref, WritableComputedRef } from "vue";
import { useLocalStorage } from "./storage";
import { QuranReader } from "@/types";

interface UseQuranReader {
    highlightVerse: Ref<string | null>
    translateMode: WritableComputedRef<QuranReader["READ_MODE"]>
}

export const useQuranReader = createGlobalState<() => UseQuranReader>((): UseQuranReader => {
    const storage = useLocalStorage();
    const highlightVerse = ref<string | null>(null);
   

    const translateMode = computed<QuranReader["READ_MODE"]>({
        set(value) {
            return storage.set("QURAN_READER:TRANSLATE_MODE", value);
        },
        get() {
            return storage.get("QURAN_READER:TRANSLATE_MODE", "read");
        }
    });

    return {
        highlightVerse,
        translateMode,
    }
});