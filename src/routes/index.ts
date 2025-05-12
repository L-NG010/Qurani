import { createRouter, createWebHistory, RouteRecordRaw } from "vue-router";
import { useState } from "@/hooks/state";
import filters from "./filters";
import checkChapterId from "./filters/checkChapterId";
import checkJuzId from "./filters/checkJuzId";
import checkPageId from "./filters/checkPageId";
import PageView from "@/views/page/index";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "home",
    component: () => import("@/views/Home/Index"),
    meta: {
      title: "Home",
    },
  },
  {
    path: "/surah/:id(\\d+)",
    name: "chapter",
    component: () => import("@/views/Chapter/Index"),
    meta: {
      filter: checkChapterId(),
      title: "Surah",
    },
  },
  {
    path: "/riwayat/surah/:id(\\d+)",
    name: "chapterRiwayat",
    component: () => import("@/views/History/Chapter/Index"),
    meta: {
      filter: checkChapterId(),
      title: "Surah",
    },
  },
  {
    path: "/surah/:id(\\d+)/info",
    name: "chapter.info",
    component: () => import("@/views/Chapter/Info/Index"),
    meta: {
      filter: checkChapterId(),
      title: "Surah Info",
    },
  },
  {
    path: "/surah/:id(\\d+)/:verse(\\d+)",
    name: "chapter.verse",
    component: () => import("@/views/Verse/Index"),
    meta: {
      filter: checkChapterId(),
      title: "Ayah",
    },
  },
  {
    path: "/juz/:id(\\d+)",
    name: "juz",
    component: () => import("@/views/Juz/Index"),
    meta: {
      filter: checkJuzId(),
      title: "Juz",
    },
  },
  {
    path: "/hafalan",
    name: "hafalan",
    component: () => import("@/views/PrayerSchedule/Index"),
    meta: {
      title: "Hafalan",
    },
  },
  {
    path: "/rekapan",
    name: "rekapan",
    component: () => import("@/components/QuranReader/Rekapan"),
    meta: {
      title: "Rekapan",
    },
  },
  {
    path: "/riwayat",
    name: "riwayat",
    component: () => import("@/components/QuranReader/Riwayat"),
    meta: {
      title: "Riwayat",
    },
  },
  // {
  //   path: "/riwayat/arabic",
  //   name: "RiwayatArabic",
  //   component: () => import("@/components/QuranReader/ArabicTextRiwayat"),
  //   meta: {
  //     title: "Riwayat",
  //   },
  // },
  {
    path: "/page/:page(\\d+)",
    name: "page",
    component: PageView,
    props: route => ({ page: Number(route.params.page) }),
    meta: {
      filter: checkPageId(),
      title: "Halaman",
    },
  },
  {
    path: "/hasilrekapan",
    name: "hasilrekapan",
    component: () => import("@/components/QuranReader/HasilRekapan"),
    meta: {
      title: "Hasil Rekapan",
    },
  },
  {
    path: "/bookmark",
    name: "bookmark",
    component: () => import("@/views/Bookmark/Bookmark"),
    meta: {
      title: "Bookmark",
    },
  },
  {
    path: "/:catchAll(.*)",
    component: () => import("@/views/Error/PageNotFound"),
    meta: {
      title: "Page Not Found",
    },
  },
];

const router = createRouter({
  history: createWebHistory(),
  linkActiveClass: "active",
  linkExactActiveClass: "exact-active",
  scrollBehavior: () => ({ top: 0 }),
  routes,
});

router.beforeEach(filters(router));
router.afterEach(() => {
  useState().forget("LOADING_PAGE");
});

export default router;