import { createGlobalState, useMemoize, UseMemoizeReturn } from "@vueuse/core";
import { ref, computed, WritableComputedRef, Ref, readonly, DeepReadonly } from "vue";
import { useHttpRetry } from "./http";
import { makeUrl } from "../helpers/api";
import { useSettings } from "./settings";
import { Locale } from "./settings";
import toast from "@/lib/toast";

export interface Juz {
  id: number;
  juz_number: number;
  pages: [number, number];
  verse_mapping: Record<string, string>;
  first_verse_id: number;
  last_verse_id: number;
  verses_count: number;
}

export interface UseJuzs {
  data: DeepReadonly<Ref<Juz[]>>;
  total: WritableComputedRef<number>;
  get: UseMemoizeReturn<Promise<Juz[]>, Locale[]>;
  load: () => Promise<void>;
  find: (id: number) => Juz | null;
}

export const useJuzs = createGlobalState<() => UseJuzs>((): UseJuzs => {
  const setting = useSettings();
  const data = ref<Juz[]>([]);

  const get = useMemoize((language: Locale): Promise<Juz[]> => {
    return useHttpRetry({ retryWhen: () => true })
      .get<{ juzs: Juz[] }>(makeUrl("juzs"), { params: { language } })
      .then((r) => r.data.juzs)
      .catch((error) => {
        toast.error("Gagal memuat data juz: " + error.message);
        return [];
      });
  });

  async function load() {
    data.value = await get(setting.locale.value);
  }

  const total = computed<number>(() => {
    return data.value.length;
  });

  const find = (id: number): Juz | null => {
    return data.value.find((item) => item.id === id) || null;
  };

  return {
    data: readonly(data),
    total,
    get,
    load,
    find,
  };
});