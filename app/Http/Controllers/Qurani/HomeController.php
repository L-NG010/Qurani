<?php

namespace App\Http\Controllers\Qurani;

use App\Http\Controllers\Controller;
use App\Models\LinkID\Group;
use App\Models\Qurani\Chapter;
use App\Models\Qurani\Juz;
use Illuminate\Http\Request;
use App\Models\LinkID\User;
use App\Models\LinkID\QuSetoran;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cookie;
use Inertia\Inertia;
use Exception;

class HomeController extends Controller
{
    public function index(Request $request)
    {
        try {
            $uId = Auth::user()->user_id;
            $friends = $this->getFriends();
            $groups = $this->getGroups();
            $chapters = $this->getChapters();
            $juzs = $this->getJuzs();
            $userSettings = $this->getUserSettings(4);
            $setoran = $this->getSetoran();
            $setoranRekap = $this->getSetoranRekap();
            $setoranRekapTotal = $this->getSetoranRekapTotal();
            $periodes = $this->getPeriodes();

            return Inertia::render('index', [
                'friends' => $friends,
                'groups' => $groups,
                'chapters' => $chapters,
                'juzs' => $juzs,
                'userSettings' => $userSettings,
                'setoran' => $setoran,
                'setoranRekap' => $setoranRekap,
                'setoranRekapTotal' => $setoranRekapTotal,
                'periodes' => $periodes,
                'u_id' => $uId
            ]);
        } catch (Exception $e) {
            Log::error('Error in HomeController@index', [
                'message' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);

            return Inertia::render('index', [
                'friends' => [],
                'groups' => [],
                'chapters' => [],
                'juzs' => [],
                'userSettings' => [],
                'setoran' => [],
                'setoranRekap' => [],
                'setoranRekapTotal' => [],
                'periodes' => [],
                'error' => 'Terjadi kesalahan saat memuat data'
            ]);
        }
    }

    public function recap(Request $request)
    {
        try {
            $uId = Auth::user()->user_id;
            return Inertia::render('recap/Index', [
                'u_id' => $uId
            ]);
        } catch (Exception $e) {
            Log::error('Error in HomeController@recap', [
                'message' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);

            return Inertia::render('Recap/Index', [
                'u_id' => null,
                'error' => 'Terjadi kesalahan saat memuat data'
            ]);
        }
    }

    private function getFriends()
    {
        try {
            $uId = Auth::user()->user_id;
            if (!$uId) {
                return [];
            }

            $friendsAsUserOne = DB::connection('linkid')
                ->table('friends')
                ->join('users', 'friends.user_two_id', '=', 'users.user_id')
                ->where('friends.user_one_id', $uId)
                ->where('friends.status', 1)
                ->select(
                    'users.user_id',
                    'users.user_name',
                    DB::raw("CONCAT(users.user_firstname, ' ', users.user_lastname) AS user_fullname")
                );

            $friendsAsUserTwo = DB::connection('linkid')
                ->table('friends')
                ->join('users', 'friends.user_one_id', '=', 'users.user_id')
                ->where('friends.user_two_id', $uId)
                ->where('friends.status', 1)
                ->select(
                    'users.user_id',
                    'users.user_name',
                    DB::raw("CONCAT(users.user_firstname, ' ', users.user_lastname) AS user_fullname")
                );

            return $friendsAsUserOne->union($friendsAsUserTwo)
                ->limit(10)
                ->get()
                ->toArray();
        } catch (Exception $e) {
            Log::error('Error in getFriends', ['message' => $e->getMessage()]);
            return [];
        }
    }

    private function getGroups()
    {
        try {
            $uId = Auth::user()->user_id;
            if (!$uId) {
                return [];
            }

            return Group::with(['users' => function ($query) use ($uId) {
                $query->where('users.user_id', '!=', $uId);
            }])
                ->whereHas('users', function ($query) use ($uId) {
                    $query->where('users.user_id', $uId);
                })
                ->select('group_id', 'group_title')
                ->get()
                ->map(function ($group) {
                    return [
                        'group_id' => $group->group_id,
                        'group_title' => $group->group_title,
                        'users' => $group->users->map(function ($user) {
                            return [
                                'user_id' => $user->user_id,
                                'user_fullname' => $user->user_fullname,
                                'user_name' => $user->user_name
                            ];
                        })->toArray()
                    ];
                })
                ->toArray();
        } catch (Exception $e) {
            Log::error('Error in getGroups', ['message' => $e->getMessage()]);
            return [];
        }
    }

    private function getChapters()
    {
        try {
            return Chapter::select('id', 'name_simple')
                ->get()
                ->map(function ($chapter) {
                    return [
                        'id' => (string) $chapter->id,
                        'name' => $chapter->name_simple,
                    ];
                })
                ->toArray();
        } catch (Exception $e) {
            Log::error('Error in getChapters', ['message' => $e->getMessage()]);
            return [];
        }
    }

    private function getJuzs()
    {
        try {
            return Juz::select('id')
                ->get()
                ->toArray();
        } catch (Exception $e) {
            Log::error('Error in getJuzs', ['message' => $e->getMessage()]);
            return [];
        }
    }

    private function getUserSettings($userId)
    {
        try {
            return DB::connection('linkid')->select("
                SELECT
                    g.id,
                    g.`key`,
                    COALESCE(u.`value`, g.`value`) AS `value`,
                    g.color,
                    g.status
                FROM qu_setting_global AS g
                LEFT JOIN qu_setting_user AS u
                    ON u.setting = g.id
                    AND u.user = ?
                ORDER BY g.id
            ", [$userId]);
        } catch (Exception $e) {
            Log::error('Error in getUserSettings', ['message' => $e->getMessage()]);
            return [];
        }
    }

    private function getSetoran()
    {
        try {
            $uId = Auth::user()->user_id;
            if (!$uId) {
                return [];
            }

            return QuSetoran::select(
                'qu_setoran.id',
                'qu_setoran.tgl',
                DB::raw("CONCAT(penyetor.user_firstname, ' ', penyetor.user_lastname) AS reciter_name"),
                'penyetor.user_name AS reciter_username',
                DB::raw("CONCAT(penerima.user_firstname, ' ', penerima.user_lastname) AS recipient_name"),
                'penerima.user_name AS recipient_username',
                'qu_setoran.setoran',
                'qu_setoran.tampilan',
                'qu_setoran.nomor',
                'qu_setoran.info',
                'qu_setoran.hasil',
                'qu_setoran.ket',
                'qu_setoran.perhalaman',
                'qu_setoran.paraf',
            )
                ->join('users AS penyetor', 'qu_setoran.penyetor', '=', 'penyetor.user_id')
                ->join('users AS penerima', 'qu_setoran.penerima', '=', 'penerima.user_id')
                ->where(function ($query) use ($uId) {
                    $query->where('qu_setoran.penyetor', $uId) // User sebagai reciter
                        ->orWhere('qu_setoran.penerima', $uId); // User sebagai recipient
                })
                ->orderBy('qu_setoran.tgl', 'desc')
                ->limit(10)
                ->get()
                ->map(function ($item) {
                    $surahName = null;
                    if ($item->tampilan === 'surah') {
                        $chapter = Chapter::find($item->nomor);
                        $surahName = $chapter ? $chapter->name_simple : null;
                        $display = $surahName ?: $item->nomor;
                        $recite = ucfirst($item->setoran) . ' ' . ucfirst($item->tampilan) . ' ' . $display . ' Ayat ' . $item->info;
                    } else {
                        // For 'page' or 'juz', only show the number without verse info
                        $display = $item->nomor;
                        $recite = ucfirst($item->setoran) . ' ' . ucfirst($item->tampilan) . ' ' . $display;
                    }
                    return [
                        'id' => $item->id,
                        'time' => Carbon::parse($item->tgl)->toDateTimeString(),
                        'reciter' => $item->reciter_name,
                        'reciter_username' => $item->reciter_username,
                        'recipient' => $item->recipient_name,
                        'recipient_username' => $item->recipient_username,
                        'recite' => $recite,
                        'results' => $item->hasil,
                        'signature' => $item->paraf ? 1 : 0,
                    ];
                })
                ->toArray();
        } catch (Exception $e) {
            Log::error('Error in getSetoran', ['message' => $e->getMessage()]);
            return [];
        }
    }

    private function getSetoranRekap()
    {
        try {
            return DB::connection('linkid')->table('qu_setoran_rekap')
                ->select(
                    'periode',
                    'kota',
                    'lat',
                    'long',
                    DB::raw('(t1 + t2 + t3 + t4 + t5 + t6 + t7 + t8 + t9 + t10 + t11 + t12 + t13 + t14 + t15 + t16 + t17 + t18 + t19 + t20 + t21 + t22 + t23 + t24 + t25 + t26 + t27 + t28 + t29 + t30 + t31) as total_setoran')
                )
                ->orderBy('periode', 'desc')
                ->orderBy('kota', 'asc')
                ->get()
                ->map(function ($item) {
                    return [
                        'periode' => $item->periode,
                        'kota' => $item->kota,
                        'lat' => (float) $item->lat,
                        'long' => (float) $item->long,
                        'total_setoran' => (int) $item->total_setoran,
                    ];
                })
                ->toArray();
        } catch (Exception $e) {
            Log::error('Error in getSetoranRekap', ['message' => $e->getMessage()]);
            return [];
        }
    }

    private function getSetoranRekapTotal()
    {
        try {
            return DB::connection('linkid')->table('qu_setoran_rekap')
                ->select(
                    'kota',
                    'lat',
                    'long',
                    DB::raw('SUM(t1 + t2 + t3 + t4 + t5 + t6 + t7 + t8 + t9 + t10 + t11 + t12 + t13 + t14 + t15 + t16 + t17 + t18 + t19 + t20 + t21 + t22 + t23 + t24 + t25 + t26 + t27 + t28 + t29 + t30 + t31) as total_setoran')
                )
                ->groupBy('kota', 'lat', 'long')
                ->orderBy('total_setoran', 'desc')
                ->get()
                ->map(function ($item) {
                    return [
                        'kota' => $item->kota,
                        'lat' => (float) $item->lat,
                        'long' => (float) $item->long,
                        'total_setoran' => (int) $item->total_setoran,
                    ];
                })
                ->toArray();
        } catch (Exception $e) {
            Log::error('Error in getSetoranRekapTotal', ['message' => $e->getMessage()]);
            return [];
        }
    }

    private function getPeriodes()
    {
        try {
            return DB::connection('linkid')->table('qu_setoran_rekap')
                ->select('periode')
                ->distinct()
                ->orderBy('periode', 'desc')
                ->get()
                ->map(function ($item) {
                    return $item->periode;
                })
                ->toArray();
        } catch (Exception $e) {
            Log::error('Error in getPeriodes', ['message' => $e->getMessage()]);
            return [];
        }
    }

    public function getSetoranById($id)
    {
        try {
            $setoran = QuSetoran::select(
                'qu_setoran.id',
                'qu_setoran.tgl',
                'penyetor.user_name AS penyetor_username',
                DB::raw("CONCAT(penyetor.user_firstname, ' ', penyetor.user_lastname) AS penyetor_fullname"),
                'penerima.user_name AS penerima_username',
                DB::raw("CONCAT(penerima.user_firstname, ' ', penerima.user_lastname) AS penerima_fullname"),
                'qu_setoran.setoran',
                'qu_setoran.tampilan',
                'qu_setoran.nomor',
                'qu_setoran.info',
                'qu_setoran.hasil',
                'qu_setoran.ket',
                'qu_setoran.kesalahan',
                'qu_setoran.perhalaman',
                'qu_setoran.paraf',
                'qu_setoran.paraftgl',
                'qu_setoran.parafoleh'
            )
                ->join('users AS penyetor', 'qu_setoran.penyetor', '=', 'penyetor.user_id')
                ->join('users AS penerima', 'qu_setoran.penerima', '=', 'penerima.user_id')
                ->where('qu_setoran.id', $id)
                ->first();

            if (!$setoran) {
                return response()->json(['error' => 'Setoran not found'], 404);
            }

            $surahName = null;
            $infoWithSurahNames = $setoran->info;

            if ($setoran->tampilan === 'surah') {
                $chapter = Chapter::find($setoran->nomor);
                $surahName = $chapter ? $chapter->name_simple : null;
            }

            // Parse info field untuk mendapatkan nama surah
            // Format: "112-1-114-6" -> "al-ikhlas-1-an-nas-6"
            if ($setoran->info && preg_match_all('/(\d+)-(\d+)/', $setoran->info, $matches, PREG_SET_ORDER)) {
                $infoParts = [];
                foreach ($matches as $match) {
                    $surahId = $match[1];
                    $ayah = $match[2];

                    // Ambil nama surah berdasarkan ID
                    $chapter = Chapter::find($surahId);
                    if ($chapter) {
                        $surahNameSimple = strtolower(str_replace(' ', '-', $chapter->name_simple));
                        $infoParts[] = $surahNameSimple . '-' . $ayah;
                    } else {
                        // Fallback jika surah tidak ditemukan
                        $infoParts[] = $surahId . '-' . $ayah;
                    }
                }

                if (!empty($infoParts)) {
                    $infoWithSurahNames = implode('-', $infoParts);
                }
            }

            // Check if perhalaman is a JSON string or already an array
            $perhalaman = is_string($setoran->perhalaman)
                ? json_decode($setoran->perhalaman, true)
                : (is_array($setoran->perhalaman) ? $setoran->perhalaman : []);

            return response()->json([
                'id' => $setoran->id,
                'tgl' => $setoran->tgl,
                'penyetor' => [
                    'username' => $setoran->penyetor_username,
                    'fullname' => $setoran->penyetor_fullname,
                ],
                'penerima' => [
                    'username' => $setoran->penerima_username,
                    'fullname' => $setoran->penerima_fullname,
                ],
                'setoran' => $setoran->setoran,
                'tampilan' => $setoran->tampilan,
                'nomor' => $setoran->nomor,
                'info' => $setoran->info,
                'info_with_surah_names' => $infoWithSurahNames,
                'hasil' => $setoran->hasil,
                'ket' => $setoran->ket,
                'kesalahan' => $setoran->kesalahan,
                'perhalaman' => $perhalaman,
                'paraf' => $setoran->paraf,
                'paraftgl' => $setoran->paraftgl,
                'parafoleh' => $setoran->parafoleh,
                'surah_name' => $surahName,
            ]);
        } catch (Exception $e) {
            Log::error('Error in getSetoranById', ['message' => $e->getMessage()]);
            return response()->json(['error' => 'Terjadi kesalahan saat mengambil data'], 500);
        }
    }
    public function updateSignature(Request $request, $id)
    {
        try {
            $userId = Auth::user()->user_id;
            if (!$userId) {
                return response()->json(['error' => 'Unauthorized'], 401);
            }

            $setoran = QuSetoran::find($id);
            if (!$setoran) {
                return response()->json(['error' => 'Setoran not found'], 404);
            }

            if ($setoran->penerima != $userId && $setoran->penyetor != $userId) {
                return response()->json(['error' => 'Unauthorized to sign this record'], 403);
            }

            $setoran->update([
                'paraf' => 1,
                'paraftgl' => Carbon::now(),
                'parafoleh' => $userId
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Signature updated successfully',
                'data' => [
                    'id' => $setoran->id,
                    'signature' => 1
                ]
            ]);
        } catch (Exception $e) {
            Log::error('Error in SignatureController@updateSignature', [
                'message' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'error' => 'Failed to update signature',
                'details' => $e->getMessage()
            ], 500);
        }
    }
}
