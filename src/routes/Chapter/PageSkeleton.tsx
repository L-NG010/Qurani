import { defineComponent, onMounted, PropType } from "vue";
import { Chapters } from "@/types";
import Skeleton from "@/components/Skeleton/Skeleton";
import Card from "@/components/Card/Card";
import Switcher from "@/components/QuranReader/Switcher";
import PlayAudioButton from "@/components/AudioPlayer/PlayAudioButton";
import VersesSkeleton from "./VersesSkeleton";

export default defineComponent({
    props: {
        chapter: {
            type: Object as PropType<Chapters>,
            required: true
        }
    },
    setup() {
        onMounted(() => {
            window.scrollTo(0, 0);
        });
    },
    render() {
        return (
            <>

            
            

                {this.chapter.bismillah_pre && (
                    <div class="row mb-5">
                        <div class="col-10 col-md-6 col-xl-4 mx-auto">
                            <Skeleton width="100%" height="100px" borderRadius="10px" />
                        </div>
                    </div>
                )}
                
                <VersesSkeleton />
            </>
        )
    }
})