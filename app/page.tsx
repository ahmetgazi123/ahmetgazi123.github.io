"use client";

import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CirclePlus,
  ClipboardList,
  Clock3,
  Factory,
  FileText,
  History,
  Layers3,
  MoreHorizontal,
  PackageCheck,
  Plus,
  Printer,
  Scissors,
  Search,
  Shirt,
  Sparkles,
  X,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { isSupabaseConfigured, setRememberSession, supabase } from "@/lib/supabase";

type LogEntry = {
  id: string;
  note: string;
  date: string;
};

type WorkOrder = {
  id: string;
  product: string;
  quantity: number;
  date: string;
  completedAt?: string;
  logs: LogEntry[];
};

type Maker = {
  id: string;
  name: string;
  phone?: string;
  color: string;
  works: WorkOrder[];
};

type PrintOrder = {
  id: string;
  product: string;
  quantity: number;
  date: string;
};

type AppData = {
  makers: Maker[];
  printOrders: PrintOrder[];
};

type Modal = "maker" | "work" | "log" | "print" | null;

const STORAGE_KEY = "fason-takip-data-v1";
const PRINT_STORAGE_KEY = "fatih-baski-data-v1";
const makerColors = [
  "from-violet-100 to-indigo-100 text-indigo-700",
  "from-rose-100 to-orange-100 text-rose-700",
  "from-emerald-100 to-teal-100 text-emerald-700",
  "from-amber-100 to-yellow-100 text-amber-700",
  "from-sky-100 to-cyan-100 text-sky-700",
];

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function todayString() {
  const date = new Date();
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

function isMaker(value: unknown): value is Maker {
  if (!value || typeof value !== "object") return false;
  const maker = value as Partial<Maker>;
  return (
    typeof maker.id === "string" &&
    typeof maker.name === "string" &&
    typeof maker.color === "string" &&
    (maker.phone === undefined || typeof maker.phone === "string") &&
    Array.isArray(maker.works) &&
    maker.works.every(
      (work) =>
        work &&
        typeof work.id === "string" &&
        typeof work.product === "string" &&
        Number.isInteger(work.quantity) &&
        work.quantity > 0 &&
        typeof work.date === "string" &&
        (work.completedAt === undefined || typeof work.completedAt === "string") &&
        Array.isArray(work.logs) &&
        work.logs.every(
          (log) =>
            log &&
            typeof log.id === "string" &&
            typeof log.note === "string" &&
            typeof log.date === "string",
        ),
    )
  );
}

function isPrintOrder(value: unknown): value is PrintOrder {
  if (!value || typeof value !== "object") return false;
  const order = value as Partial<PrintOrder>;
  return (
    typeof order.id === "string" &&
    typeof order.product === "string" &&
    typeof order.quantity === "number" &&
    Number.isInteger(order.quantity) &&
    order.quantity > 0 &&
    typeof order.date === "string"
  );
}

function isAppData(value: unknown): value is AppData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<AppData>;
  return (
    Array.isArray(data.makers) &&
    data.makers.every(isMaker) &&
    Array.isArray(data.printOrders) &&
    data.printOrders.every(isPrintOrder)
  );
}

function readLocalAppData(): AppData {
  const savedMakers = window.localStorage.getItem(STORAGE_KEY);
  const savedPrintOrders = window.localStorage.getItem(PRINT_STORAGE_KEY);
  const makers: unknown = savedMakers ? JSON.parse(savedMakers) : [];
  const printOrders: unknown = savedPrintOrders ? JSON.parse(savedPrintOrders) : [];
  if (!Array.isArray(makers) || !makers.every(isMaker)) {
    throw new Error("Bu cihazdaki fasoncu kayıtlarının biçimi tanınamadı.");
  }
  if (!Array.isArray(printOrders) || !printOrders.every(isPrintOrder)) {
    throw new Error("Bu cihazdaki baskı kayıtlarının biçimi tanınamadı.");
  }
  return { makers, printOrders };
}

function formatDate(value: string, options?: Intl.DateTimeFormatOptions) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", options ?? {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("tr-TR"))
    .join("");
}

export default function Home() {
  const [makers, setMakers] = useState<Maker[]>([]);
  const [printOrders, setPrintOrders] = useState<PrintOrder[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [passwordRecoveryPending, setPasswordRecoveryPending] = useState(false);
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"loading" | "synced" | "saving" | "error">("loading");
  const [syncRetryToken, setSyncRetryToken] = useState(0);
  const [authError, setAuthError] = useState("");
  const lastCloudDataRef = useRef("");
  const latestDataRef = useRef<AppData>({ makers: [], printOrders: [] });
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const processedRetryRef = useRef(0);
  const [selectedMakerId, setSelectedMakerId] = useState<string | null>(null);
  const [showPrinting, setShowPrinting] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [targetWorkId, setTargetWorkId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"active" | "history">("active");
  const [searchTerm, setSearchTerm] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }
    let mounted = true;
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setAuthError("");
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecoveryPending(true);
      }
      if (!session) {
        setPasswordRecoveryPending(false);
        setCloudLoaded(false);
        lastCloudDataRef.current = "";
      }
    });
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) {
          console.error("Supabase oturumu okunamadı.", error);
          setAuthError("Oturum bilgisi alınamadı. Sayfayı yenileyip tekrar deneyin.");
        }
        setUser(data.session?.user ?? null);
        setAuthReady(true);
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        console.error("Supabase oturumu kontrol edilemedi.", error);
        setAuthError("Supabase oturumu kontrol edilemedi. Sayfayı yenileyip tekrar deneyin.");
        setAuthReady(true);
      });
    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !user) {
      setCloudLoaded(false);
      return;
    }
    const client = supabase;
    const currentUser = user;
    let mounted = true;
    lastCloudDataRef.current = "";
    setCloudLoaded(false);
    setSyncStatus("loading");

    const channel = client
      .channel(`user-data-${currentUser.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_data",
          filter: `user_id=eq.${currentUser.id}`,
        },
        (payload) => {
          const incoming = (payload.new as { data?: unknown }).data;
          if (!isAppData(incoming)) {
            setSyncStatus("error");
            setToast("Buluttan gelen kayıtların biçimi geçersiz.");
            return;
          }
          const signature = JSON.stringify(incoming);
          if (signature === lastCloudDataRef.current) return;
          lastCloudDataRef.current = signature;
          setMakers(incoming.makers);
          setPrintOrders(incoming.printOrders);
          setSyncStatus("synced");
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Supabase gerçek zamanlı bağlantısı kurulamadı.", status);
          setSyncStatus("error");
        }
      });

    async function loadCloudData() {
      const { data, error } = await client
        .from("user_data")
        .select("data")
        .eq("user_id", currentUser.id)
        .maybeSingle();

      if (!mounted) return;
      if (error) {
        console.error("Bulut kayıtları alınamadı.", error);
        setSyncStatus("error");
        setToast("Bulut kayıtları alınamadı. Supabase tablo ve erişim ayarlarını kontrol edin.");
        return;
      }

      if (data) {
        if (!isAppData(data.data)) {
          setSyncStatus("error");
          setToast("Buluttaki kayıtların biçimi tanınamadı; veriler korunmak için yüklenmedi.");
          return;
        }
        const signature = JSON.stringify(data.data);
        lastCloudDataRef.current = signature;
        setMakers(data.data.makers);
        setPrintOrders(data.data.printOrders);
        setCloudLoaded(true);
        setSyncStatus("synced");
        return;
      }

      let initialData: AppData;
      try {
        initialData = readLocalAppData();
      } catch (localError) {
        console.error("İlk bulut aktarımı için yerel veriler okunamadı.", localError);
        setSyncStatus("error");
        setToast(localError instanceof Error ? localError.message : "Yerel kayıtlar okunamadı.");
        return;
      }

      const signature = JSON.stringify(initialData);
      const { error: insertError } = await client.from("user_data").insert({
        user_id: currentUser.id,
        data: initialData,
      });
      if (!mounted) return;
      if (insertError) {
        console.error("İlk bulut kaydı oluşturulamadı.", insertError);
        setSyncStatus("error");
        setToast("İlk bulut kaydı oluşturulamadı. Supabase tablo ve RLS ayarlarını kontrol edin.");
        return;
      }

      lastCloudDataRef.current = signature;
      setMakers(initialData.makers);
      setPrintOrders(initialData.printOrders);
      setCloudLoaded(true);
      setSyncStatus("synced");
      if (initialData.makers.length || initialData.printOrders.length) {
        setToast("Bu cihazdaki kayıtlar Supabase'e aktarıldı.");
      }
    }

    void loadCloudData().catch((error: unknown) => {
      if (!mounted) return;
      console.error("Bulut kayıtları yüklenirken beklenmeyen hata oluştu.", error);
      setSyncStatus("error");
      setToast("Supabase bağlantısı kurulamadı. İnternet ve Supabase ayarlarını kontrol edin.");
    });
    return () => {
      mounted = false;
      void client.removeChannel(channel);
    };
  }, [user]);

  latestDataRef.current = { makers, printOrders };

  useEffect(() => {
    if (!supabase || !user || !cloudLoaded) return;
    const client = supabase;
    const currentUser = user;
    const snapshot: AppData = { makers, printOrders };
    const signature = JSON.stringify(snapshot);
    if (signature === lastCloudDataRef.current && syncRetryToken === processedRetryRef.current) return;
    const timer = window.setTimeout(() => {
      setSyncStatus("saving");
      processedRetryRef.current = syncRetryToken;
      saveQueueRef.current = saveQueueRef.current
        .then(async () => {
          if (signature === lastCloudDataRef.current) return;
          const { error } = await client
            .from("user_data")
            .upsert({ user_id: currentUser.id, data: snapshot }, { onConflict: "user_id" });
          if (error) throw error;
          if (JSON.stringify(latestDataRef.current) === signature) {
            lastCloudDataRef.current = signature;
            setSyncStatus("synced");
          }
        })
        .catch((error: unknown) => {
          console.error("Bulut senkronizasyonu başarısız.", error);
          setSyncStatus("error");
          setToast("Değişiklikler buluta kaydedilemedi. İnternet bağlantınızı kontrol edip yeniden deneyin.");
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [makers, printOrders, cloudLoaded, user, syncRetryToken]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectedMaker = makers.find((maker) => maker.id === selectedMakerId) ?? null;
  const filteredMakers = useMemo(
    () => makers.filter((maker) => maker.name.toLocaleLowerCase("tr-TR").includes(searchTerm.toLocaleLowerCase("tr-TR"))),
    [makers, searchTerm],
  );
  const activeWorkCount = makers.reduce(
    (total, maker) => total + maker.works.filter((work) => !work.completedAt).length,
    0,
  );
  const totalUnits = makers.reduce(
    (total, maker) =>
      total + maker.works.filter((work) => !work.completedAt).reduce((sum, work) => sum + work.quantity, 0),
    0,
  );
  const totalPrintUnits = printOrders.reduce((total, order) => total + order.quantity, 0);

  function openDashboard() {
    setSelectedMakerId(null);
    setShowPrinting(false);
  }

  function openPrinting() {
    setSelectedMakerId(null);
    setShowPrinting(true);
  }

  function addPrintOrder(product: string, quantity: number, date: string) {
    const order: PrintOrder = {
      id: makeId(),
      product: product.trim(),
      quantity,
      date,
    };
    setPrintOrders((current) => [order, ...current]);
    setModal(null);
    setToast("Baskıya giden ürün kaydedildi.");
  }

  function addMaker(name: string, phone: string) {
    const maker: Maker = {
      id: makeId(),
      name: name.trim(),
      phone: phone.trim() || undefined,
      color: makerColors[makers.length % makerColors.length],
      works: [],
    };
    setMakers((current) => [maker, ...current]);
    setSelectedMakerId(maker.id);
    setActiveTab("active");
    setModal(null);
    setToast(`${maker.name} fasoncu listenize eklendi.`);
  }

  function addWork(product: string, quantity: number, date: string) {
    if (!selectedMaker) return;
    const work: WorkOrder = {
      id: makeId(),
      product: product.trim(),
      quantity,
      date,
      logs: [],
    };
    setMakers((current) =>
      current.map((maker) =>
        maker.id === selectedMaker.id ? { ...maker, works: [work, ...maker.works] } : maker,
      ),
    );
    setModal(null);
    setToast("Yeni iş aktif işlere eklendi.");
  }

  function addLog(note: string, date: string) {
    if (!selectedMaker || !targetWorkId) return;
    const log: LogEntry = { id: makeId(), note: note.trim(), date };
    setMakers((current) =>
      current.map((maker) =>
        maker.id === selectedMaker.id
          ? {
              ...maker,
              works: maker.works.map((work) =>
                work.id === targetWorkId ? { ...work, logs: [...work.logs, log] } : work,
              ),
            }
          : maker,
      ),
    );
    setModal(null);
    setTargetWorkId(null);
    setToast("Teslimat notu zaman çizelgesine eklendi.");
  }

  function completeWork(workId: string) {
    if (!selectedMaker) return;
    setMakers((current) =>
      current.map((maker) =>
        maker.id === selectedMaker.id
          ? {
              ...maker,
              works: maker.works.map((work) =>
                work.id === workId ? { ...work, completedAt: todayString() } : work,
              ),
            }
          : maker,
      ),
    );
    setToast("İş geçmiş işlere taşındı.");
  }

  if (!isSupabaseConfigured || !supabase) {
    return <SupabaseSetupScreen />;
  }

  if (!authReady) {
    return <LoadingScreen message="Supabase bağlantısı kontrol ediliyor..." />;
  }

  if (!user) {
    return <AuthScreen initialError={authError} />;
  }

  if (passwordRecoveryPending) {
    return <PasswordRecoveryScreen onComplete={() => setPasswordRecoveryPending(false)} />;
  }

  if (!cloudLoaded) {
    return (
      <LoadingScreen
        message={syncStatus === "error" ? "Bulut bağlantısı kurulamadı." : "Kayıtlarınız Supabase'ten yükleniyor..."}
        error={syncStatus === "error"}
        onRetry={() => window.location.reload()}
      />
    );
  }

  const visibleWorks = selectedMaker
    ? selectedMaker.works.filter((work) => (activeTab === "active" ? !work.completedAt : Boolean(work.completedAt)))
    : [];

  return (
    <main className="min-h-screen bg-canvas pb-24 md:pb-8">
      <div className="mx-auto flex min-h-screen max-w-[1440px]">
        <aside className="hidden w-[270px] shrink-0 border-r border-line bg-white px-5 py-7 md:flex md:flex-col">
          <Brand />
          <div className="mt-10">
            <p className="mb-3 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">ÇALIŞMA ALANI</p>
            <button
              onClick={openDashboard}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition ${selectedMakerId || showPrinting ? "text-slate-500 hover:bg-slate-50" : "bg-brand-50 text-brand-700"}`}
            >
              <Layers3 size={18} strokeWidth={1.9} />
              Genel Bakış
            </button>
            <button
              onClick={openPrinting}
              className={`mt-1 flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm font-semibold transition ${showPrinting ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-50"}`}
            >
              <span className="flex items-center gap-3"><Printer size={18} strokeWidth={1.9} /> Fatih Baskı</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${showPrinting ? "bg-white text-brand-700" : "bg-slate-100 text-slate-500"}`}>{printOrders.length}</span>
            </button>
            <div className="mt-2 flex items-center justify-between px-3 py-3">
              <span className="flex items-center gap-3 text-sm font-semibold text-slate-500">
                <Factory size={18} strokeWidth={1.9} /> Fasoncular
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{makers.length}</span>
            </div>
            <div className="mt-1 space-y-1">
              {makers.slice(0, 5).map((maker) => (
                <button
                  key={maker.id}
                  onClick={() => {
                    setSelectedMakerId(maker.id);
                    setActiveTab("active");
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${selectedMakerId === maker.id ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-500 hover:bg-slate-50"}`}
                >
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br text-[10px] font-bold ${maker.color}`}>{getInitials(maker.name)}</span>
                  <span className="truncate">{maker.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="mt-auto rounded-2xl bg-indigo-50 p-4">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white text-brand-600 shadow-sm"><Sparkles size={17} /></div>
            <p className="text-sm font-bold text-slate-800">Her şey kayıt altında</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Verileriniz bu cihazda güvenle saklanır.</p>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-line/80 bg-white/95 backdrop-blur">
            <div className="mx-auto flex h-[70px] max-w-[1120px] items-center justify-between px-4 sm:px-7 lg:px-10">
              <div className="md:hidden"><Brand compact /></div>
              <div className="hidden md:block">
                <p className="text-xs font-medium capitalize text-slate-400">Bugün, {formatDate(todayString(), { day: "numeric", month: "long" })}</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-700">{selectedMaker ? selectedMaker.name : showPrinting ? "Fatih Baskı" : "İş takibiniz"}</p>
              </div>
              <div className="ml-auto flex items-center gap-2.5">
                <div className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 sm:flex">
                  <span className={`h-1.5 w-1.5 rounded-full ${syncStatus === "error" ? "bg-rose-500" : syncStatus === "saving" || syncStatus === "loading" ? "bg-amber-500" : "bg-emerald-500"}`} />
                  <span className={`text-xs font-semibold ${syncStatus === "error" ? "text-rose-700" : syncStatus === "saving" || syncStatus === "loading" ? "text-amber-700" : "text-emerald-700"}`}>
                    {syncStatus === "error" ? "Senkronizasyon hatası" : syncStatus === "saving" ? "Buluta kaydediliyor" : syncStatus === "loading" ? "Bağlanıyor" : "Eşzamanlı kayıt"}
                  </span>
                </div>
                {syncStatus === "error" && (
                  <button
                    onClick={() => setSyncRetryToken((current) => current + 1)}
                    className="hidden rounded-full border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 sm:block"
                  >
                    Tekrar dene
                  </button>
                )}
                <div aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500">
                  <Bell size={19} strokeWidth={1.8} />
                </div>
                <button
                  type="button"
                  title={`${user.email ?? "Hesap"} — çıkış yapmak için tıklayın`}
                  onClick={async () => {
                    if (!supabase) return;
                    const { error } = await supabase.auth.signOut();
                    if (error) {
                      console.error("Supabase oturumu kapatılamadı.", error);
                      setToast("Oturum kapatılamadı. Tekrar deneyin.");
                    }
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-500 text-xs font-bold text-white"
                >
                  {(user.email?.[0] ?? "FT").toLocaleUpperCase("tr-TR")}
                </button>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1120px] px-4 py-6 sm:px-7 sm:py-8 lg:px-10 lg:py-10">
            {selectedMaker ? (
              <section className="animate-enter">
                <div className="mb-6 flex items-center gap-2 text-xs font-medium text-slate-400">
                  <button onClick={() => setSelectedMakerId(null)} className="transition hover:text-brand-600">Fasoncular</button>
                  <ChevronRight size={14} />
                  <span className="text-slate-600">{selectedMaker.name}</span>
                </div>
                <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setSelectedMakerId(null)} aria-label="Geri dön" className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white text-slate-500 shadow-card md:hidden">
                      <ArrowLeft size={19} />
                    </button>
                    <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br text-lg font-bold ${selectedMaker.color}`}>{getInitials(selectedMaker.name)}</div>
                    <div>
                      <h1 className="text-[22px] font-bold tracking-tight text-ink sm:text-[26px]">{selectedMaker.name}</h1>
                      <p className="mt-1 text-sm text-slate-500">{selectedMaker.phone || "Fasoncu detayları ve iş geçmişi"}</p>
                    </div>
                  </div>
                  <button onClick={() => setModal("work")} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 active:scale-[0.98]">
                    <Plus size={18} strokeWidth={2.4} /> Yeni iş ekle
                  </button>
                </div>
                <div className="mb-6 grid grid-cols-2 gap-3 sm:max-w-[440px]">
                  <MiniStat icon={<Scissors size={16} />} label="Aktif iş" value={String(selectedMaker.works.filter((work) => !work.completedAt).length)} tint="indigo" />
                  <MiniStat icon={<ClipboardList size={16} />} label="Geçmiş iş" value={String(selectedMaker.works.filter((work) => work.completedAt).length)} tint="emerald" />
                </div>
                <div className="border-b border-line">
                  <div className="flex gap-7">
                    <button onClick={() => setActiveTab("active")} className={`relative pb-3 text-sm font-semibold transition ${activeTab === "active" ? "text-brand-700" : "text-slate-400 hover:text-slate-600"}`}>
                      Aktif işler <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] ${activeTab === "active" ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500"}`}>{selectedMaker.works.filter((work) => !work.completedAt).length}</span>
                      {activeTab === "active" && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-brand-600" />}
                    </button>
                    <button onClick={() => setActiveTab("history")} className={`relative pb-3 text-sm font-semibold transition ${activeTab === "history" ? "text-brand-700" : "text-slate-400 hover:text-slate-600"}`}>
                      Geçmiş işler <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] ${activeTab === "history" ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500"}`}>{selectedMaker.works.filter((work) => work.completedAt).length}</span>
                      {activeTab === "history" && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-brand-600" />}
                    </button>
                  </div>
                </div>
                <div className="pt-5">
                  {visibleWorks.length > 0 ? (
                    <div className="space-y-4">
                      {visibleWorks.map((work) => (
                        <WorkCard
                          key={work.id}
                          work={work}
                          isHistory={Boolean(work.completedAt)}
                          onAddLog={() => {
                            setTargetWorkId(work.id);
                            setModal("log");
                          }}
                          onComplete={() => completeWork(work.id)}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyWorks history={activeTab === "history"} onAdd={() => setModal("work")} />
                  )}
                </div>
              </section>
            ) : showPrinting ? (
              <PrintingSection
                orders={printOrders}
                totalUnits={totalPrintUnits}
                onAdd={() => setModal("print")}
              />
            ) : (
              <section className="animate-enter">
                <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.09em] text-brand-700"><Sparkles size={12} /> Hoş geldiniz</div>
                    <h1 className="text-[28px] font-bold tracking-tight text-ink sm:text-[34px]">İşleriniz, <span className="text-brand-600">düzenli.</span></h1>
                    <p className="mt-2 text-sm text-slate-500 sm:text-[15px]">Fason işlerinizi ve teslimat notlarını tek yerden takip edin.</p>
                  </div>
                  <button onClick={() => setModal("maker")} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 active:scale-[0.98]">
                    <Plus size={18} strokeWidth={2.4} /> Fasoncu ekle
                  </button>
                </div>

                <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-3">
                  <SummaryCard icon={<Factory size={17} />} label="Fasoncu" value={String(makers.length)} note="Kayıtlı atölye" tone="indigo" />
                  <SummaryCard icon={<Scissors size={17} />} label="Aktif iş" value={String(activeWorkCount)} note="Devam eden işler" tone="blue" />
                  <SummaryCard icon={<PackageCheck size={17} />} label="Toplam adet" value={totalUnits.toLocaleString("tr-TR")} note="Aktif işlerde" tone="green" className="col-span-2 lg:col-span-1" />
                </div>

                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-ink">Fasoncular</h2>
                    <p className="mt-0.5 text-xs text-slate-400">{makers.length ? `${makers.length} atölye ile çalışıyorsunuz` : "Çalıştığınız atölyeleri burada yönetin"}</p>
                  </div>
                  {makers.length > 0 && (
                    <label className="flex h-10 items-center gap-2.5 rounded-xl border border-line bg-white px-3 text-slate-400 shadow-card focus-within:border-brand-300 sm:w-[240px]">
                      <Search size={16} />
                      <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Fasoncu ara..." className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" />
                    </label>
                  )}
                </div>

                {filteredMakers.length ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredMakers.map((maker, index) => (
                      <button
                        key={maker.id}
                        onClick={() => {
                          setSelectedMakerId(maker.id);
                          setActiveTab("active");
                        }}
                        className="group flex min-h-[124px] items-center gap-4 rounded-2xl border border-line/80 bg-white p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:border-brand-100 hover:shadow-md sm:p-5"
                      >
                        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[15px] bg-gradient-to-br text-sm font-bold ${maker.color}`}>{getInitials(maker.name)}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="truncate font-bold text-ink">{maker.name}</h3>
                            {index === 0 && <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">Son eklenen</span>}
                          </div>
                          <p className="mt-1 truncate text-xs text-slate-400">{maker.phone || "Fasoncu detaylarını görüntüle"}</p>
                          <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                            <span className={`h-1.5 w-1.5 rounded-full ${maker.works.some((work) => !work.completedAt) ? "bg-emerald-500" : "bg-slate-300"}`} />
                            {maker.works.filter((work) => !work.completedAt).length} aktif iş
                            <span className="ml-auto flex items-center gap-1 text-brand-600 opacity-0 transition group-hover:opacity-100">Detay <ArrowRight size={13} /></span>
                          </div>
                        </div>
                        <ChevronRight className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500 sm:hidden" size={18} />
                      </button>
                    ))}
                  </div>
                ) : makers.length ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-12 text-center">
                    <Search className="mx-auto text-slate-300" size={24} />
                    <p className="mt-3 text-sm font-semibold text-slate-700">Eşleşen fasoncu bulunamadı</p>
                    <p className="mt-1 text-xs text-slate-400">Farklı bir isimle tekrar arayın.</p>
                  </div>
                ) : (
                  <EmptyMakers onAdd={() => setModal("maker")} />
                )}

                <div className="mb-4 mt-9 flex flex-col gap-3 border-t border-line pt-7 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-bold text-ink"><Printer size={19} className="text-brand-600" /> Fatih Baskı</h2>
                    <p className="mt-0.5 text-xs text-slate-400">Baskıya gönderdiğiniz ürünleri takip edin</p>
                  </div>
                  <button onClick={openPrinting} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-brand-100 bg-brand-50 px-3.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-100">
                    Baskı kayıtlarını gör <ArrowRight size={15} />
                  </button>
                </div>
                <PrintOrdersPreview orders={printOrders.slice(0, 2)} onOpen={openPrinting} />
              </section>
            )}
            <footer className="mt-10 flex items-center justify-between border-t border-line/80 pt-5 text-[11px] text-slate-400">
              <span>Fason Takip · Üretiminiz yolunda</span>
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Verileriniz bu cihazda saklanır</span>
            </footer>
          </div>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-5 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md items-center justify-around">
          <button onClick={openDashboard} className={`flex min-w-[58px] flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-semibold ${!selectedMaker && !showPrinting ? "text-brand-600" : "text-slate-400"}`}>
            <Layers3 size={19} strokeWidth={1.9} /> Genel
          </button>
          <button onClick={openPrinting} className={`flex min-w-[58px] flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-semibold ${showPrinting ? "text-brand-600" : "text-slate-400"}`}>
            <Printer size={19} strokeWidth={1.9} /> Baskı
          </button>
          <button onClick={() => setModal("maker")} aria-label="Fasoncu ekle" className="-mt-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-soft transition active:scale-95">
            <Plus size={22} strokeWidth={2.2} />
          </button>
          <button onClick={() => {
            const firstWithActive = makers.find((maker) => maker.works.some((work) => !work.completedAt));
            if (firstWithActive) {
              setSelectedMakerId(firstWithActive.id);
              setActiveTab("active");
            }
          }} className="flex min-w-[66px] flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[10px] font-semibold text-slate-400">
            <Scissors size={19} strokeWidth={1.9} /> Aktif işler
          </button>
          <button onClick={() => {
            const firstWithHistory = makers.find((maker) => maker.works.some((work) => work.completedAt));
            if (firstWithHistory) {
              setSelectedMakerId(firstWithHistory.id);
              setActiveTab("history");
            }
          }} className="flex min-w-[66px] flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[10px] font-semibold text-slate-400">
            <History size={19} strokeWidth={1.9} /> Geçmiş
          </button>
        </div>
      </nav>

      {modal && (
        <ModalShell title={modal === "maker" ? "Yeni fasoncu ekle" : modal === "work" ? "Yeni iş oluştur" : modal === "log" ? "Teslimat notu ekle" : "Baskı kaydı ekle"} onClose={() => setModal(null)}>
          {modal === "maker" && <MakerForm onSubmit={addMaker} onCancel={() => setModal(null)} />}
          {modal === "work" && <WorkForm onSubmit={addWork} onCancel={() => setModal(null)} />}
          {modal === "log" && <LogForm onSubmit={addLog} onCancel={() => setModal(null)} />}
          {modal === "print" && <PrintOrderForm onSubmit={addPrintOrder} onCancel={() => setModal(null)} />}
        </ModalShell>
      )}
      {toast && (
        <div role="status" className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-soft md:bottom-8">
          <CheckCircle2 size={17} className="text-emerald-400" /> {toast}
        </div>
      )}
    </main>
  );
}

function SupabaseSetupScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <section className="w-full max-w-lg rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><Layers3 size={23} /></div>
        <h1 className="text-xl font-bold text-ink">Supabase bağlantısı gerekli</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Cihazlar arası eşzamanlı kayıtları açmak için Supabase projenizin bağlantı ayarlarını tanımlayın.</p>
        <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600">
          <li><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">supabase/schema.sql</code> dosyasını Supabase SQL Editor'de çalıştırın.</li>
          <li>Proje URL'si ve publishable/anon anahtarıyla kök dizinde <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">.env.local</code> oluşturun.</li>
          <li>GitHub Pages için Actions secrets ve build environment değerlerini ekleyin.</li>
        </ol>
        <p className="mt-5 text-xs text-slate-400">Ayrıntılı adımlar: SUPABASE_SETUP.md</p>
      </section>
    </main>
  );
}

function LoadingScreen({ message, error = false, onRetry }: { message: string; error?: boolean; onRetry?: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="max-w-sm rounded-2xl border border-line bg-white p-7 text-center shadow-card">
        <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl ${error ? "bg-rose-50 text-rose-600" : "bg-brand-50 text-brand-600"}`}>
          {error ? <X size={22} /> : <Layers3 size={22} />}
        </div>
        <p className="mt-4 text-sm font-semibold text-slate-700">{message}</p>
        {error && onRetry && (
          <button onClick={onRetry} className="mt-4 h-10 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700">Tekrar dene</button>
        )}
      </div>
    </main>
  );
}

function AuthScreen({ initialError }: { initialError: string }) {
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "reset-password">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberSession, setRememberSessionState] = useState(true);
  const [message, setMessage] = useState(initialError);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRememberSessionState(window.localStorage.getItem("fason-takip-remember-session") !== "false");
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    try {
      if (mode === "reset-password") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setMessage("Şifre yenileme bağlantısı e-posta adresinize gönderildi. Gelen kutunuzu ve spam klasörünü kontrol edin.");
      } else if (mode === "sign-up") {
        setRememberSession(rememberSession);
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) {
          setMessage("Hesap oluşturuldu. E-postanıza gelen doğrulama bağlantısını açıp ardından giriş yapın.");
        }
      } else {
        setRememberSession(rememberSession);
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (error) {
      console.error("Supabase kimlik doğrulaması başarısız.", error);
      const errorMessage = error instanceof Error ? error.message : "";
      if (mode === "sign-in" && /invalid login credentials/i.test(errorMessage)) {
        setMessage("E-posta veya şifre eşleşmiyor. E-posta doğrulama iletisini kontrol edin veya “Şifremi unuttum” seçeneğini kullanın.");
      } else if (/email not confirmed/i.test(errorMessage)) {
        setMessage("E-posta adresiniz henüz doğrulanmamış. Supabase'den gelen doğrulama e-postasındaki bağlantıya tıklayın.");
      } else {
        setMessage(errorMessage || "Giriş sırasında bir hata oluştu.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <section className="w-full max-w-[420px] rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8">
        <Brand />
        <div className="mt-8">
          <h1 className="text-2xl font-bold tracking-tight text-ink">{mode === "sign-in" ? "Hesabınıza giriş yapın" : mode === "sign-up" ? "İlk hesabınızı oluşturun" : "Şifrenizi yenileyin"}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Aynı hesapla giriş yaptığınız cihazlarda kayıtlarınız eşzamanlı görünür.</p>
        </div>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="E-posta" required>
            <input autoComplete="email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ornek@firma.com" className={inputClass} />
          </Field>
          {mode !== "reset-password" && (
            <Field label="Şifre" required>
              <input autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required minLength={6} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="En az 6 karakter" className={inputClass} />
            </Field>
          )}
          {mode !== "reset-password" && (
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={rememberSession}
                onChange={(event) => {
                  const remember = event.target.checked;
                  setRememberSessionState(remember);
                  setRememberSession(remember);
                }}
                className="h-4 w-4 rounded border-slate-300 accent-brand-600"
              />
              <span>Beni hatırla <span className="text-xs text-slate-400">(bu cihazda açık kalsın)</span></span>
            </label>
          )}
          {message && <p role="alert" className="rounded-xl bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-800">{message}</p>}
          <button disabled={busy} type="submit" className="h-11 w-full rounded-xl bg-brand-600 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60">
            {busy ? "Lütfen bekleyin..." : mode === "sign-in" ? "Giriş yap" : mode === "sign-up" ? "Hesap oluştur" : "Sıfırlama bağlantısı gönder"}
          </button>
        </form>
        {mode === "sign-in" && (
          <button onClick={() => { setMode("reset-password"); setMessage(""); }} className="mt-4 block w-full text-center text-sm font-semibold text-brand-700 hover:text-brand-800">
            Şifremi unuttum
          </button>
        )}
        <p className="mt-5 text-center text-sm text-slate-500">
          {mode === "sign-in" ? "İlk kez mi kullanıyorsunuz?" : mode === "sign-up" ? "Zaten hesabınız var mı?" : "Şifrenizi hatırladınız mı?"}{" "}
          <button onClick={() => { setMode(mode === "sign-in" ? "sign-up" : "sign-in"); setMessage(""); }} className="font-semibold text-brand-700 hover:text-brand-800">
            {mode === "sign-in" ? "Hesap oluştur" : "Giriş yap"}
          </button>
        </p>
        <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-slate-400"><CheckCircle2 size={13} className="text-emerald-500" /> Kayıtlarınız Supabase ile güvenli biçimde eşzamanlanır</div>
      </section>
    </main>
  );
}

function PasswordRecoveryScreen({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    if (password !== confirmPassword) {
      setMessage("Girdiğiniz şifreler eşleşmiyor.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      onComplete();
    } catch (error) {
      console.error("Şifre güncellenemedi.", error);
      setMessage(error instanceof Error ? error.message : "Şifre güncellenemedi. Sıfırlama bağlantısını yeniden isteyin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <section className="w-full max-w-[420px] rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8">
        <Brand />
        <div className="mt-8">
          <h1 className="text-2xl font-bold tracking-tight text-ink">Yeni şifrenizi belirleyin</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Hesabınız için en az 6 karakterli yeni bir şifre oluşturun.</p>
        </div>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Yeni şifre" required>
            <input autoFocus autoComplete="new-password" required minLength={6} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="En az 6 karakter" className={inputClass} />
          </Field>
          <Field label="Yeni şifre (tekrar)" required>
            <input autoComplete="new-password" required minLength={6} type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Şifrenizi tekrar girin" className={inputClass} />
          </Field>
          {message && <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-3 text-xs leading-5 text-rose-700">{message}</p>}
          <button disabled={busy} type="submit" className="h-11 w-full rounded-xl bg-brand-600 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60">
            {busy ? "Kaydediliyor..." : "Yeni şifreyi kaydet"}
          </button>
        </form>
      </section>
    </main>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
        <Shirt size={19} strokeWidth={2.1} />
      </div>
      {!compact && (
        <div>
          <p className="text-[15px] font-extrabold tracking-tight text-slate-800">fason<span className="text-brand-600">takip</span></p>
          <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.17em] text-slate-400">ÜRETİMİNİZ YOLUNDA</p>
        </div>
      )}
      {compact && <p className="text-[15px] font-extrabold tracking-tight text-slate-800">fason<span className="text-brand-600">takip</span></p>}
    </div>
  );
}

function SummaryCard({ icon, label, value, note, tone, className = "" }: { icon: React.ReactNode; label: string; value: string; note: string; tone: "indigo" | "blue" | "green"; className?: string }) {
  const styles = {
    indigo: "bg-indigo-50 text-indigo-600",
    blue: "bg-sky-50 text-sky-600",
    green: "bg-emerald-50 text-emerald-600",
  }[tone];
  return (
    <div className={`rounded-2xl border border-line/80 bg-white p-4 shadow-card sm:p-5 ${className}`}>
      <div className="flex items-start justify-between">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${styles}`}>{icon}</div>
        <MoreHorizontal size={18} className="text-slate-300" />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="text-2xl font-bold tracking-tight text-ink">{value}</p>
        <p className="text-xs font-medium text-slate-500">{label}</p>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">{note}</p>
    </div>
  );
}

function MiniStat({ icon, label, value, tint }: { icon: React.ReactNode; label: string; value: string; tint: "indigo" | "emerald" }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line/80 bg-white px-3.5 py-3 shadow-card">
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tint === "indigo" ? "bg-indigo-50 text-brand-600" : "bg-emerald-50 text-emerald-600"}`}>{icon}</span>
      <div><p className="text-[11px] text-slate-400">{label}</p><p className="mt-0.5 text-sm font-bold text-ink">{value}</p></div>
    </div>
  );
}

function WorkCard({ work, isHistory, onAddLog, onComplete }: { work: WorkOrder; isHistory: boolean; onAddLog: () => void; onComplete: () => void }) {
  const sortedLogs = [...work.logs].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <article className="overflow-hidden rounded-2xl border border-line/80 bg-white shadow-card">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isHistory ? "bg-emerald-50 text-emerald-600" : "bg-indigo-50 text-brand-600"}`}>
              {isHistory ? <CheckCircle2 size={19} /> : <Shirt size={19} />}
            </div>
            <div className="min-w-0">
              <h3 className="truncate font-bold text-ink">{work.product}</h3>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                <span className="flex items-center gap-1"><CalendarDays size={13} /> {formatDate(work.date, { day: "numeric", month: "short", year: "numeric" })}</span>
                <span className="flex items-center gap-1"><PackageCheck size={13} /> {work.quantity.toLocaleString("tr-TR")} adet</span>
              </div>
            </div>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${isHistory ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{isHistory ? "Tamamlandı" : "Devam ediyor"}</span>
        </div>
        {isHistory && work.completedAt && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700"><Check size={14} /> {formatDate(work.completedAt)} tarihinde tamamlandı</p>
        )}
        {!isHistory && (
          <button onClick={onAddLog} className="mt-4 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-brand-100 bg-brand-50/70 px-3 text-xs font-semibold text-brand-700 transition hover:bg-brand-50 sm:w-auto sm:px-4">
            <CirclePlus size={16} /> Not ekle / teslimat kaydı gir
          </button>
        )}
      </div>
      <div className="border-t border-line/80 bg-slate-50/60 px-4 py-4 sm:px-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-bold text-slate-600"><FileText size={14} className="text-slate-400" /> Teslimat günlüğü</p>
          <span className="rounded-md bg-white px-2 py-1 text-[10px] font-semibold text-slate-400 shadow-sm">{work.logs.length} kayıt</span>
        </div>
        {sortedLogs.length ? (
          <div className="ml-1 space-y-0">
            {sortedLogs.map((log, index) => (
              <div key={log.id} className="relative flex gap-3 pb-4 last:pb-0">
                {index !== sortedLogs.length - 1 && <span className="absolute left-[5px] top-3 h-full w-px bg-indigo-100" />}
                <span className="relative mt-1 h-3 w-3 shrink-0 rounded-full border-[3px] border-white bg-brand-400 ring-1 ring-brand-100" />
                <div className="min-w-0 flex-1 rounded-xl border border-line/70 bg-white px-3.5 py-3">
                  <p className="text-sm leading-5 text-slate-700">{log.note}</p>
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-slate-400"><Clock3 size={12} /> {formatDate(log.date)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white/70 px-3 py-3 text-xs text-slate-400">
            <Clock3 size={14} /> Henüz teslimat notu eklenmedi.
          </div>
        )}
      </div>
      {!isHistory && (
        <div className="flex justify-end border-t border-line/70 px-4 py-3 sm:px-5">
          <button onClick={onComplete} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-700">
            <CheckCircle2 size={15} /> İşi bitir
          </button>
        </div>
      )}
    </article>
  );
}

function EmptyMakers({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-12 text-center shadow-card sm:py-16">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-brand-600"><Factory size={25} strokeWidth={1.8} /></div>
      <h3 className="mt-4 text-base font-bold text-ink">Henüz fasoncu eklemediniz</h3>
      <p className="mx-auto mt-1.5 max-w-[310px] text-sm leading-6 text-slate-500">İlk atölyenizi ekleyerek işlerinizi, teslimat notlarınızı kolayca takip etmeye başlayın.</p>
      <button onClick={onAdd} className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700"><Plus size={16} /> İlk fasoncunu ekle</button>
    </div>
  );
}

function PrintOrdersPreview({ orders, onOpen }: { orders: PrintOrder[]; onOpen: () => void }) {
  return (
    <div className="rounded-2xl border border-line/80 bg-white p-4 shadow-card sm:p-5">
      {orders.length ? (
        <div className="divide-y divide-line/70">
          {orders.map((order) => (
            <div key={order.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><Printer size={17} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{order.product}</p>
                <p className="mt-0.5 text-xs text-slate-400">{formatDate(order.date, { day: "numeric", month: "short", year: "numeric" })}</p>
              </div>
              <span className="shrink-0 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600">{order.quantity.toLocaleString("tr-TR")} adet</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm text-slate-500">Henüz baskıya gönderilen ürün kaydı yok.</p>
          <button onClick={onOpen} className="text-xs font-semibold text-brand-700 hover:text-brand-800">Baskı kayıtlarını aç <ArrowRight size={13} className="ml-1 inline" /></button>
        </div>
      )}
    </div>
  );
}

function PrintingSection({ orders, totalUnits, onAdd }: { orders: PrintOrder[]; totalUnits: number; onAdd: () => void }) {
  return (
    <section className="animate-enter">
      <div className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.09em] text-violet-700"><Printer size={13} /> Baskı takibi</div>
          <h1 className="text-[28px] font-bold tracking-tight text-ink sm:text-[34px]">Fatih Baskı</h1>
          <p className="mt-2 text-sm text-slate-500 sm:text-[15px]">Baskıya gönderdiğiniz ürünleri ve adetleri kaydedin.</p>
        </div>
        <button onClick={onAdd} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 active:scale-[0.98]">
          <Plus size={18} strokeWidth={2.4} /> Baskı kaydı ekle
        </button>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:max-w-[440px]">
        <MiniStat icon={<FileText size={16} />} label="Kayıt" value={String(orders.length)} tint="indigo" />
        <MiniStat icon={<PackageCheck size={16} />} label="Gönderilen adet" value={totalUnits.toLocaleString("tr-TR")} tint="emerald" />
      </div>
      <div className="mb-4">
        <h2 className="text-lg font-bold text-ink">Baskıya giden ürünler</h2>
        <p className="mt-0.5 text-xs text-slate-400">En son eklenen kayıtlar en üstte görünür</p>
      </div>
      {orders.length ? (
        <div className="space-y-3">
          {orders.map((order) => (
            <article key={order.id} className="flex items-center gap-3 rounded-2xl border border-line/80 bg-white p-4 shadow-card sm:gap-4 sm:p-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><Printer size={19} /></div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-bold text-ink sm:text-base">{order.product}</h3>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400"><CalendarDays size={13} /> {formatDate(order.date, { day: "numeric", month: "short", year: "numeric" })}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-base font-bold text-ink">{order.quantity.toLocaleString("tr-TR")}</p>
                <p className="text-[11px] text-slate-400">adet</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-12 text-center shadow-card sm:py-16">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600"><Printer size={24} strokeWidth={1.8} /></div>
          <h3 className="mt-4 text-base font-bold text-ink">Henüz baskı kaydı yok</h3>
          <p className="mx-auto mt-1.5 max-w-[310px] text-sm leading-6 text-slate-500">Fatih Baskı’ya gönderdiğiniz ilk ürünü kaydederek başlayın.</p>
          <button onClick={onAdd} className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700"><Plus size={16} /> İlk baskı kaydını ekle</button>
        </div>
      )}
    </section>
  );
}

function EmptyWorks({ history, onAdd }: { history: boolean; onAdd: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-12 text-center shadow-card sm:py-14">
      <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl ${history ? "bg-emerald-50 text-emerald-600" : "bg-indigo-50 text-brand-600"}`}>{history ? <History size={22} /> : <Scissors size={22} />}</div>
      <h3 className="mt-4 text-sm font-bold text-ink">{history ? "Henüz tamamlanan iş yok" : "Aktif iş bulunmuyor"}</h3>
      <p className="mt-1.5 text-xs text-slate-500">{history ? "Tamamladığınız işler burada listelenecek." : "Bu fasoncuya yeni bir iş vererek başlayabilirsiniz."}</p>
      {!history && <button onClick={onAdd} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-brand-600 px-3.5 text-xs font-semibold text-white transition hover:bg-brand-700"><Plus size={15} /> Yeni iş ekle</button>}
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="modal-title" className="animate-enter w-full max-w-[460px] rounded-t-[24px] bg-white p-5 shadow-soft sm:rounded-2xl sm:p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 id="modal-title" className="text-lg font-bold text-ink">{title}</h2>
          <button aria-label="Kapat" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><X size={19} /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

function MakerForm({ onSubmit, onCancel }: { onSubmit: (name: string, phone: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim()) onSubmit(name, phone);
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Fasoncu / atölye adı" required>
        <input autoFocus required maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder="Örn. Yıldız Tekstil" className={inputClass} />
      </Field>
      <Field label="Telefon" hint="İsteğe bağlı">
        <input type="tel" maxLength={25} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="05XX XXX XX XX" className={inputClass} />
      </Field>
      <FormActions onCancel={onCancel} submitLabel="Fasoncuyu ekle" />
    </form>
  );
}

function WorkForm({ onSubmit, onCancel }: { onSubmit: (product: string, quantity: number, date: string) => void; onCancel: () => void }) {
  const [product, setProduct] = useState("");
  const [quantity, setQuantity] = useState("");
  const [date, setDate] = useState(todayString());
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedQuantity = Number(quantity);
    if (product.trim() && Number.isInteger(parsedQuantity) && parsedQuantity > 0) onSubmit(product, parsedQuantity, date);
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Ürün adı" required>
        <input autoFocus required maxLength={80} value={product} onChange={(event) => setProduct(event.target.value)} placeholder="Örn. Pamuklu bebek tulumu" className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Verilen adet" required>
          <input required type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="500" className={inputClass} />
        </Field>
        <Field label="Veriliş tarihi" required>
          <input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} />
        </Field>
      </div>
      <FormActions onCancel={onCancel} submitLabel="İşi oluştur" />
    </form>
  );
}

function LogForm({ onSubmit, onCancel }: { onSubmit: (note: string, date: string) => void; onCancel: () => void }) {
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayString());
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (note.trim()) onSubmit(note, date);
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-3.5 py-3 text-xs leading-5 text-indigo-800">
        <p className="font-bold">Sadece not tutuyoruz</p>
        <p className="mt-0.5 text-indigo-700">Parçalı teslimatlarda adet sayılmaz. Gelenleri kısaca not edin.</p>
      </div>
      <Field label="Teslimat notu" required>
        <textarea autoFocus required maxLength={500} rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Örn. 2 çuval geldi, sayılmadı" className={`${inputClass} min-h-[100px] resize-y py-3`} />
        <span className="mt-1 block text-right text-[10px] text-slate-400">{note.length}/500</span>
      </Field>
      <Field label="Teslimat tarihi" required>
        <input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} />
      </Field>
      <FormActions onCancel={onCancel} submitLabel="Notu kaydet" />
    </form>
  );
}

function PrintOrderForm({ onSubmit, onCancel }: { onSubmit: (product: string, quantity: number, date: string) => void; onCancel: () => void }) {
  const [product, setProduct] = useState("");
  const [quantity, setQuantity] = useState("");
  const [date, setDate] = useState(todayString());
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedQuantity = Number(quantity);
    if (product.trim() && Number.isInteger(parsedQuantity) && parsedQuantity > 0) {
      onSubmit(product, parsedQuantity, date);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Ürün adı" required>
        <input autoFocus required maxLength={80} value={product} onChange={(event) => setProduct(event.target.value)} placeholder="Örn. Bebek tulumu – ön baskı" className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Gönderilen adet" required>
          <input required type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="500" className={inputClass} />
        </Field>
        <Field label="Gönderim tarihi" required>
          <input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} />
        </Field>
      </div>
      <FormActions onCancel={onCancel} submitLabel="Baskı kaydını ekle" />
    </form>
  );
}

const inputClass = "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none transition placeholder:text-slate-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">{label}{required && <span className="text-rose-500">*</span>}{hint && <span className="font-normal text-slate-400">· {hint}</span>}</span>
      {children}
    </label>
  );
}

function FormActions({ onCancel, submitLabel }: { onCancel: () => void; submitLabel: string }) {
  return (
    <div className="flex gap-2.5 pt-2">
      <button type="button" onClick={onCancel} className="h-11 flex-1 rounded-xl border border-line text-sm font-semibold text-slate-600 transition hover:bg-slate-50">Vazgeç</button>
      <button type="submit" className="h-11 flex-1 rounded-xl bg-brand-600 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 active:scale-[0.99]">{submitLabel}</button>
    </div>
  );
}
