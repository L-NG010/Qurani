import { defineComponent, onMounted, onBeforeUnmount } from "vue";
import { RouterView, useRouter } from "vue-router";
import setPageTitle from "./helpers/set-page-title";
import LoaderBook from "./components/PageLoader/Book";
import LoaderProgress from "./components/PageLoader/Progress";
import AudioPlayer from "./components/AudioPlayer/AudioPlayer";

export default defineComponent({
  setup() {
    const router = useRouter();

    router.afterEach(route => {
      if (typeof route.meta.title === "string") setPageTitle(route.meta.title);
    });

    const clearSetoranData = () => {
      console.log("app.tsx: Membersihkan setoranData dari localStorage saat aplikasi dimuat");
      localStorage.removeItem("setoranData"); // Hanya hapus setoranData, biarkan key lain
    };

    const handleMessage = (event: MessageEvent) => {
      // Sesuaikan dengan origin parent yang sebenarnya
      const trustedOrigins = [
        "http://localhost", // Untuk pengembangan
        "http://localhost:80", // Jika backend menggunakan port default
        // Tambahkan origin produksi jika ada, misalnya: "https://yourdomain.com"
      ];

      if (!trustedOrigins.includes(event.origin)) {
        console.warn(`app.tsx: ⚠️ Pesan dari origin tidak terpercaya: ${event.origin}`);
        return;
      }

      const data = event.data;
      console.log("app.tsx: group_id diterima:", data.group_id);
      console.log("app.tsx: ✅ Pesan dari parent diterima:", data);

      // Validasi data
      if (!data || typeof data !== "object") {
        console.error("app.tsx: ⚠️ Data pesan tidak valid:", data);
        return;
      }

      try {
        // Tentukan jenis postMessage berdasarkan field yang ada
        const isSetoranPayload = data.tampilkan_type && ["surat", "juz", "halaman"].includes(data.tampilkan_type);
        const isRiwayatPayload = data.id && data.formatted_date;

        let payloadType = "unknown";
        if (isSetoranPayload) {
          payloadType = "setoran";
        } else if (isRiwayatPayload) {
          payloadType = "riwayat";
        }

        console.log(`app.tsx: Jenis payload: ${payloadType}`);

        // Simpan seluruh payload sebagai setoranData
        localStorage.setItem("setoranData", JSON.stringify(data));
        console.log(`app.tsx: ✅ setoranData (${payloadType}) diperbarui di localStorage:`, data);

        // Simpan field individual untuk kompatibilitas
        // Field umum
        localStorage.setItem("user_id", data.user_id?.toString() || "");
        localStorage.setItem("user_name", data.user_name || "");
        localStorage.setItem("penyimak_id", data.penyimak_id?.toString() || "");
        localStorage.setItem("penyimak_name", data.penyimak_name || "");
        localStorage.setItem("penyimak_type", data.penyimak_type || "");
        localStorage.setItem("group_id", data.group_id?.toString() || "");

        // Field khusus untuk setoran
        localStorage.setItem("setoran_type", data.setoran_type || "");
        localStorage.setItem("tampilkan_type", data.tampilkan_type || "");
        localStorage.setItem("surat_id", data.surat_id?.toString() || "");
        localStorage.setItem("surat_name", data.surat_name || "");
        localStorage.setItem("juz_id", data.juz_id?.toString() || "");
        localStorage.setItem("juz_name", data.juz_name || "");
        localStorage.setItem("halaman", data.halaman?.toString() || "");

        // Field khusus untuk riwayat
        localStorage.setItem("id", data.id?.toString() || "");
        localStorage.setItem("formatted_date", data.formatted_date || "");
        localStorage.setItem("info", data.info || "");
        localStorage.setItem("hasil", data.hasil || "");
        localStorage.setItem("paraf", data.paraf?.toString() || "0");
        localStorage.setItem("ket", data.ket || "");
        localStorage.setItem("kesalahan", data.kesalahan || "");
        localStorage.setItem("perhalaman", data.perhalaman || "");

        // Dispatch event untuk memberi tahu komponen lain
        const eventData = { ...data, payloadType };
        console.log(
          `app.tsx: Mengirim CustomEvent setoranDataReceived (type: ${payloadType}):`,
          eventData,
          "Waktu:",
          new Date().toISOString()
        );
        window.dispatchEvent(new CustomEvent("setoranDataReceived", { detail: eventData }));
      } catch (error) {
        console.error("app.tsx: ⚠️ Gagal memproses data pesan:", error);
      }
    };

    onMounted(() => {
      
      console.log("app.tsx: Menambahkan message listener");
      clearSetoranData(); // Bersihkan hanya setoranData saat aplikasi dimuat
      window.addEventListener("message", handleMessage);
    });

    onBeforeUnmount(() => {
      console.log("app.tsx: Menghapus message listener");
      window.removeEventListener("message", handleMessage);
    });
  },

  render() {
    return (
      <>
        <LoaderProgress visible={this.$state.get("LOADING_PAGE") === "progress"} />
        <LoaderBook visible={this.$state.get("LOADING_PAGE") === "book"} />
        <AudioPlayer />
        <RouterView />
      </>
    );
  },
});