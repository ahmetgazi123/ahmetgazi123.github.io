"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Banknote,
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
  ListTodo,
  MoreHorizontal,
  PackageCheck,
  Pencil,
  Plus,
  Printer,
  Scissors,
  Search,
  Shirt,
  Sparkles,
  Trash2,
  Wallet,
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

type WorkTask = {
  id: string;
  text: string;
  completed: boolean;
};

type PaymentEntry = {
  id: string;
  amount: number;
  date: string;
  note?: string;
};

type WorkOrder = {
  id: string;
  product: string;
  quantity: number;
  date: string;
  completedAt?: string;
  logs: LogEntry[];
  tasks?: WorkTask[];
  totalPrice?: number;
  payments?: PaymentEntry[];
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

type Modal = "maker" | "work" | "edit-work" | "delete-work" | "log" | "print" | "bulk-payment" | null;

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

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function formatCurrency(amount: number) {
  return `${new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount)} ₺`;
}

function getWorkFinance(work: WorkOrder) {
  const totalPrice = roundCurrency(work.totalPrice ?? 0);
  const paidAmount = roundCurrency(
    (work.payments ?? []).reduce((sum, payment) => sum + payment.amount, 0),
  );
  const remainingDebt = Math.max(0, roundCurrency(totalPrice - paidAmount));
  const status: "none" | "unpaid" | "partial" | "paid" =
    totalPrice <= 0 && paidAmount <= 0
      ? "none"
      : remainingDebt <= 0
        ? "paid"
        : paidAmount > 0
          ? "partial"
          : "unpaid";

  return { totalPrice, paidAmount, remainingDebt, status };
}

function getMakerFinance(maker: Maker) {
  return maker.works.reduce(
    (acc, work) => {
      const { totalPrice, paidAmount, remainingDebt } = getWorkFinance(work);
      return {
        totalPrice: roundCurrency(acc.totalPrice + totalPrice),
        paidAmount: roundCurrency(acc.paidAmount + paidAmount),
        remainingDebt: roundCurrency(acc.remainingDebt + remainingDebt),
      };
    },
    { totalPrice: 0, paidAmount: 0, remainingDebt: 0 },
  );
}

function isWorkTask(value: unknown): value is WorkTask {
  if (!value || typeof value !== "object") return false;
  const task = value as Partial<WorkTask>;
  return (
    typeof task.id === "string" &&
    typeof task.text === "string" &&
    typeof task.completed === "boolean"
  );
}

function isPaymentEntry(value: unknown): value is PaymentEntry {
  if (!value || typeof value !== "object") return false;
  const payment = value as Partial<PaymentEntry>;
  return (
    typeof payment.id === "string" &&
    typeof payment.amount === "number" &&
    Number.isFinite(payment.amount) &&
    payment.amount > 0 &&
    typeof payment.date === "string" &&
    (payment.note === undefined || typeof payment.note === "string")
  );
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
        ) &&
        (work.tasks === undefined || (Array.isArray(work.tasks) && work.tasks.every(isWorkTask))) &&
        (work.totalPrice === undefined ||
          (typeof work.totalPrice === "number" &&
            Number.isFinite(work.totalPrice) &&
            work.totalPrice >= 0)) &&
        (work.payments === undefined ||
          (Array.isArray(work.payments) && work.payments.every(isPaymentEntry))),
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

  const [bulkPaymentMakerId, setBulkPaymentMakerId] = useState<string | null>(null);
  const selectedMaker = makers.find((maker) => maker.id === selectedMakerId) ?? null;
  const bulkPaymentMaker = makers.find((maker) => maker.id === bulkPaymentMakerId) ?? selectedMaker;
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
  const overallFinance = useMemo(
    () =>
      makers.reduce(
        (acc, maker) => {
          const finance = getMakerFinance(maker);
          return {
            totalPrice: roundCurrency(acc.totalPrice + finance.totalPrice),
            paidAmount: roundCurrency(acc.paidAmount + finance.paidAmount),
            remainingDebt: roundCurrency(acc.remainingDebt + finance.remainingDebt),
          };
        },
        { totalPrice: 0, paidAmount: 0, remainingDebt: 0 },
      ),
    [makers],
  );

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

  function addWork(product: string, quantity: number, date: string, totalPrice?: number) {
    if (!selectedMaker) return;
    const work: WorkOrder = {
      id: makeId(),
      product: product.trim(),
      quantity,
      date,
      logs: [],
      tasks: [],
      totalPrice: totalPrice !== undefined && totalPrice >= 0 ? roundCurrency(totalPrice) : undefined,
      payments: [],
    };
    setMakers((current) =>
      current.map((maker) =>
        maker.id === selectedMaker.id ? { ...maker, works: [work, ...maker.works] } : maker,
      ),
    );
    setModal(null);
    setToast("Yeni iş aktif işlere eklendi.");
  }

  function updateWork(
    workId: string,
    product: string,
    quantity: number,
    date: string,
    targetMakerId: string,
    totalPrice?: number,
  ) {
    if (!selectedMaker) return;
    const existingWork = selectedMaker.works.find((work) => work.id === workId);
    if (!existingWork) return;

    const updatedWork: WorkOrder = {
      ...existingWork,
      product: product.trim(),
      quantity,
      date,
      totalPrice: totalPrice !== undefined && totalPrice >= 0 ? roundCurrency(totalPrice) : undefined,
    };

    if (targetMakerId === selectedMaker.id) {
      setMakers((current) =>
        current.map((maker) =>
          maker.id === selectedMaker.id
            ? {
                ...maker,
                works: maker.works.map((work) => (work.id === workId ? updatedWork : work)),
              }
            : maker,
        ),
      );
      setToast("İş bilgileri güncellendi.");
    } else {
      const targetMaker = makers.find((maker) => maker.id === targetMakerId);
      setMakers((current) =>
        current.map((maker) => {
          if (maker.id === selectedMaker.id) {
            return { ...maker, works: maker.works.filter((work) => work.id !== workId) };
          }
          if (maker.id === targetMakerId) {
            return { ...maker, works: [updatedWork, ...maker.works] };
          }
          return maker;
        }),
      );
      setToast(
        targetMaker
          ? `İş güncellendi ve ${targetMaker.name} atölyesine taşındı.`
          : "İş bilgileri güncellendi.",
      );
    }

    setModal(null);
    setTargetWorkId(null);
  }

  function deleteWork(workId: string) {
    if (!selectedMaker) return;
    const existingWork = selectedMaker.works.find((work) => work.id === workId);
    const isHistoryWork = Boolean(existingWork?.completedAt);
    setMakers((current) =>
      current.map((maker) =>
        maker.id === selectedMaker.id
          ? { ...maker, works: maker.works.filter((work) => work.id !== workId) }
          : maker,
      ),
    );
    setModal(null);
    setTargetWorkId(null);
    setToast(isHistoryWork ? "Geçmiş iş kaydı kalıcı olarak silindi." : "Aktif iş silindi.");
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

  function updateLog(workId: string, logId: string, note: string, date: string) {
    if (!selectedMaker) return;
    setMakers((current) =>
      current.map((maker) =>
        maker.id === selectedMaker.id
          ? {
              ...maker,
              works: maker.works.map((work) =>
                work.id === workId
                  ? {
                      ...work,
                      logs: work.logs.map((log) =>
                        log.id === logId ? { ...log, note: note.trim(), date } : log,
                      ),
                    }
                  : work,
              ),
            }
          : maker,
      ),
    );
    setToast("Teslimat notu güncellendi.");
  }

  function addTask(workId: string, text: string) {
    if (!selectedMaker || !text.trim()) return;
    const newTask: WorkTask = {
      id: makeId(),
      text: text.trim(),
      completed: false,
    };
    setMakers((current) =>
      current.map((maker) =>
        maker.id === selectedMaker.id
          ? {
              ...maker,
              works: maker.works.map((work) =>
                work.id === workId
                  ? { ...work, tasks: [...(work.tasks ?? []), newTask] }
                  : work,
              ),
            }
          : maker,
      ),
    );
    setToast("Görev / eksik malzeme eklendi.");
  }

  function toggleTask(workId: string, taskId: string) {
    if (!selectedMaker) return;
    setMakers((current) =>
      current.map((maker) =>
        maker.id === selectedMaker.id
          ? {
              ...maker,
              works: maker.works.map((work) =>
                work.id === workId
                  ? {
                      ...work,
                      tasks: (work.tasks ?? []).map((task) =>
                        task.id === taskId ? { ...task, completed: !task.completed } : task,
                      ),
                    }
                  : work,
              ),
            }
          : maker,
      ),
    );
  }

  function updateTask(workId: string, taskId: string, text: string) {
    if (!selectedMaker || !text.trim()) return;
    setMakers((current) =>
      current.map((maker) =>
        maker.id === selectedMaker.id
          ? {
              ...maker,
              works: maker.works.map((work) =>
                work.id === workId
                  ? {
                      ...work,
                      tasks: (work.tasks ?? []).map((task) =>
                        task.id === taskId ? { ...task, text: text.trim() } : task,
                      ),
                    }
                  : work,
              ),
            }
          : maker,
      ),
    );
    setToast("Görev güncellendi.");
  }

  function deleteTask(workId: string, taskId: string) {
    if (!selectedMaker) return;
    setMakers((current) =>
      current.map((maker) =>
        maker.id === selectedMaker.id
          ? {
              ...maker,
              works: maker.works.map((work) =>
                work.id === workId
                  ? {
                      ...work,
                      tasks: (work.tasks ?? []).filter((task) => task.id !== taskId),
                    }
                  : work,
              ),
            }
          : maker,
      ),
    );
    setToast("Görev listeden kaldırıldı.");
  }

  function addPayment(workId: string, amount: number, date: string, note?: string) {
    if (!selectedMaker || !Number.isFinite(amount) || amount <= 0) return;
    const payment: PaymentEntry = {
      id: makeId(),
      amount: roundCurrency(amount),
      date,
      note: note?.trim() || undefined,
    };
    setMakers((current) =>
      current.map((maker) =>
        maker.id === selectedMaker.id
          ? {
              ...maker,
              works: maker.works.map((work) =>
                work.id === workId
                  ? { ...work, payments: [...(work.payments ?? []), payment] }
                  : work,
              ),
            }
          : maker,
      ),
    );
    setToast(`${formatCurrency(payment.amount)} ödeme kaydedildi.`);
  }

  function deletePayment(workId: string, paymentId: string) {
    if (!selectedMaker) return;
    setMakers((current) =>
      current.map((maker) =>
        maker.id === selectedMaker.id
          ? {
              ...maker,
              works: maker.works.map((work) =>
                work.id === workId
                  ? {
                      ...work,
                      payments: (work.payments ?? []).filter((payment) => payment.id !== paymentId),
                    }
                  : work,
              ),
            }
          : maker,
      ),
    );
    setToast("Ödeme kaydı silindi.");
  }

  function closeRemainingBalance(workId: string) {
    if (!selectedMaker) return;
    const target = selectedMaker.works.find((work) => work.id === workId);
    if (!target) return;
    const { remainingDebt } = getWorkFinance(target);
    if (remainingDebt <= 0) return;
    addPayment(workId, remainingDebt, todayString(), "Kalan bakiye kapatıldı");
  }

  function addBulkMakerPayment(makerId: string, amount: number, date: string, note?: string) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const targetMaker = makers.find((maker) => maker.id === makerId);
    if (!targetMaker) return;

    let remainingToDistribute = roundCurrency(amount);
    const unpaidWorkIdsSorted = [...targetMaker.works]
      .filter((work) => getWorkFinance(work).remainingDebt > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((work) => work.id);

    const allocations = new Map<string, number>();
    for (const workId of unpaidWorkIdsSorted) {
      if (remainingToDistribute <= 0) break;
      const work = targetMaker.works.find((w) => w.id === workId);
      if (!work) continue;
      const { remainingDebt } = getWorkFinance(work);
      const allocated = Math.min(remainingDebt, remainingToDistribute);
      if (allocated > 0) {
        allocations.set(workId, roundCurrency(allocated));
        remainingToDistribute = roundCurrency(remainingToDistribute - allocated);
      }
    }

    setMakers((current) =>
      current.map((maker) => {
        if (maker.id !== makerId) return maker;
        return {
          ...maker,
          works: maker.works.map((work) => {
            const allocated = allocations.get(work.id);
            if (!allocated) return work;
            const payment: PaymentEntry = {
              id: makeId(),
              amount: allocated,
              date,
              note: note?.trim() ? `${note.trim()} (Toplu ödeme)` : "Toplu ödeme",
            };
            return {
              ...work,
              payments: [...(work.payments ?? []), payment],
            };
          }),
        };
      }),
    );

    setModal(null);
    setBulkPaymentMakerId(null);
    setToast(`${targetMaker.name} için ${formatCurrency(amount - remainingToDistribute)} toplu ödeme işlere dağıtıldı.`);
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
  const targetWork = selectedMaker?.works.find((work) => work.id === targetWorkId) ?? null;
  const selectedMakerFinance = selectedMaker ? getMakerFinance(selectedMaker) : null;

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
                  <div className="flex flex-wrap items-center gap-2.5">
                    {selectedMakerFinance && selectedMakerFinance.remainingDebt > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setBulkPaymentMakerId(selectedMaker.id);
                          setModal("bulk-payment");
                        }}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100 active:scale-[0.98]"
                      >
                        <Wallet size={17} /> Toplu ödeme yap
                      </button>
                    )}
                    <button onClick={() => setModal("work")} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 active:scale-[0.98]">
                      <Plus size={18} strokeWidth={2.4} /> Yeni iş ekle
                    </button>
                  </div>
                </div>

                <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
                  <MiniStat icon={<Scissors size={16} />} label="Aktif iş" value={String(selectedMaker.works.filter((work) => !work.completedAt).length)} tint="indigo" />
                  <MiniStat icon={<ClipboardList size={16} />} label="Geçmiş iş" value={String(selectedMaker.works.filter((work) => work.completedAt).length)} tint="emerald" />
                  <MiniStat icon={<Banknote size={16} />} label="Toplam tutar" value={formatCurrency(selectedMakerFinance?.totalPrice ?? 0)} tint="indigo" />
                  <MiniStat icon={<CheckCircle2 size={16} />} label="Toplam ödenen" value={formatCurrency(selectedMakerFinance?.paidAmount ?? 0)} tint="emerald" />
                  <MiniStat
                    icon={<Wallet size={16} />}
                    label="Kalan borç"
                    value={formatCurrency(selectedMakerFinance?.remainingDebt ?? 0)}
                    tint={(selectedMakerFinance?.remainingDebt ?? 0) > 0 ? "rose" : "emerald"}
                    className="col-span-2 lg:col-span-1"
                  />
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
                          onEditWork={() => {
                            setTargetWorkId(work.id);
                            setModal("edit-work");
                          }}
                          onDeleteWork={() => {
                            setTargetWorkId(work.id);
                            setModal("delete-work");
                          }}
                          onUpdateLog={(logId, note, date) => updateLog(work.id, logId, note, date)}
                          onAddTask={(text) => addTask(work.id, text)}
                          onToggleTask={(taskId) => toggleTask(work.id, taskId)}
                          onUpdateTask={(taskId, text) => updateTask(work.id, taskId, text)}
                          onDeleteTask={(taskId) => deleteTask(work.id, taskId)}
                          onAddPayment={(amount, date, note) => addPayment(work.id, amount, date, note)}
                          onDeletePayment={(paymentId) => deletePayment(work.id, paymentId)}
                          onCloseRemainingBalance={() => closeRemainingBalance(work.id)}
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
                    <p className="mt-2 text-sm text-slate-500 sm:text-[15px]">Fason işlerinizi, teslimat notlarınızı ve cari ödemelerinizi tek yerden takip edin.</p>
                  </div>
                  <button onClick={() => setModal("maker")} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 active:scale-[0.98]">
                    <Plus size={18} strokeWidth={2.4} /> Fasoncu ekle
                  </button>
                </div>

                <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <SummaryCard icon={<Factory size={17} />} label="Fasoncu" value={String(makers.length)} note="Kayıtlı atölye" tone="indigo" />
                  <SummaryCard icon={<Scissors size={17} />} label="Aktif iş" value={String(activeWorkCount)} note="Devam eden işler" tone="blue" />
                  <SummaryCard icon={<PackageCheck size={17} />} label="Toplam adet" value={totalUnits.toLocaleString("tr-TR")} note="Aktif işlerde" tone="green" />
                  <SummaryCard
                    icon={<Wallet size={17} />}
                    label="Toplam kalan borç"
                    value={formatCurrency(overallFinance.remainingDebt)}
                    note={`Ödenen: ${formatCurrency(overallFinance.paidAmount)}`}
                    tone={overallFinance.remainingDebt > 0 ? "rose" : "green"}
                  />
                </div>

                {/* Fasoncu Bazlı Kalan Borç Özeti (Cari Özet) */}
                {makers.length > 0 && (
                  <div className="mb-8 overflow-hidden rounded-2xl border border-line/80 bg-white shadow-card">
                    <div className="flex flex-col gap-2 border-b border-line/80 bg-slate-50/70 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-brand-600">
                          <Wallet size={16} />
                        </span>
                        <div>
                          <h2 className="text-sm font-bold text-ink">Fasoncu Bazlı Kalan Borç Özeti (Cari)</h2>
                          <p className="text-[11px] text-slate-400">Fasoncuların güncel bakiye durumu ve toplu ödeme yönetimi</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-lg bg-white px-2.5 py-1 font-semibold text-slate-600 shadow-sm">
                          Toplam: <strong>{formatCurrency(overallFinance.totalPrice)}</strong>
                        </span>
                        <span className="rounded-lg bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                          Ödenen: <strong>{formatCurrency(overallFinance.paidAmount)}</strong>
                        </span>
                        <span className="rounded-lg bg-rose-50 px-2.5 py-1 font-bold text-rose-700">
                          Kalan Borç: {formatCurrency(overallFinance.remainingDebt)}
                        </span>
                      </div>
                    </div>
                    <div className="divide-y divide-line/70 px-4 sm:px-5">
                      {makers.map((maker) => {
                        const finance = getMakerFinance(maker);
                        return (
                          <div
                            key={maker.id}
                            className="flex flex-col gap-2.5 py-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span
                                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-xs font-bold ${maker.color}`}
                              >
                                {getInitials(maker.name)}
                              </span>
                              <div className="min-w-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedMakerId(maker.id);
                                    setActiveTab("active");
                                  }}
                                  className="truncate text-left text-sm font-bold text-ink transition hover:text-brand-600"
                                >
                                  {maker.name} —{" "}
                                  <span className={finance.remainingDebt > 0 ? "text-rose-600" : "text-emerald-600"}>
                                    Toplam Kalan Borç: {formatCurrency(finance.remainingDebt)}
                                  </span>
                                </button>
                                <p className="text-[11px] text-slate-400">
                                  Toplam İş Tutarı: {formatCurrency(finance.totalPrice)} · Ödenen: {formatCurrency(finance.paidAmount)}
                                </p>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {finance.remainingDebt > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBulkPaymentMakerId(maker.id);
                                    setModal("bulk-payment");
                                  }}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                                >
                                  <Banknote size={14} /> Ödeme Yap
                                </button>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                                  <Check size={12} /> Borç Yok
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedMakerId(maker.id);
                                  setActiveTab("active");
                                }}
                                className="inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-white px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                              >
                                Detay <ArrowRight size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

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
                    {filteredMakers.map((maker, index) => {
                      const activeWorks = maker.works.filter((work) => !work.completedAt);
                      const pendingTasksCount = activeWorks.reduce(
                        (sum, work) => sum + (work.tasks ?? []).filter((task) => !task.completed).length,
                        0,
                      );
                      const makerFinance = getMakerFinance(maker);
                      return (
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
                            <p className="mt-1 truncate text-xs text-slate-400">
                              {makerFinance.remainingDebt > 0
                                ? `Kalan Borç: ${formatCurrency(makerFinance.remainingDebt)}`
                                : maker.phone || "Fasoncu detaylarını görüntüle"}
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs font-medium text-slate-500">
                              <span className={`h-1.5 w-1.5 rounded-full ${activeWorks.length > 0 ? "bg-emerald-500" : "bg-slate-300"}`} />
                              <span>{activeWorks.length} aktif iş</span>
                              {pendingTasksCount > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-inset ring-amber-200/80">
                                  ⚠️ {pendingTasksCount} görev
                                </span>
                              )}
                              <span className="ml-auto flex items-center gap-1 text-brand-600 opacity-0 transition group-hover:opacity-100">Detay <ArrowRight size={13} /></span>
                            </div>
                          </div>
                          <ChevronRight className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500 sm:hidden" size={18} />
                        </button>
                      );
                    })}
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
        <ModalShell
          title={
            modal === "maker"
              ? "Yeni fasoncu ekle"
              : modal === "work"
                ? "Yeni iş oluştur"
                : modal === "edit-work"
                  ? "Aktif işi düzenle"
                  : modal === "delete-work"
                    ? targetWork?.completedAt
                      ? "Geçmiş işi sil"
                      : "Aktif işi sil"
                    : modal === "bulk-payment"
                      ? `${bulkPaymentMaker?.name ?? "Fasoncu"} — Toplu Ödeme`
                      : modal === "log"
                        ? "Teslimat notu ekle"
                        : "Baskı kaydı ekle"
          }
          onClose={() => {
            setModal(null);
            setTargetWorkId(null);
            setBulkPaymentMakerId(null);
          }}
        >
          {modal === "maker" && <MakerForm onSubmit={addMaker} onCancel={() => setModal(null)} />}
          {modal === "work" && <WorkForm onSubmit={addWork} onCancel={() => setModal(null)} />}
          {modal === "edit-work" && targetWork && selectedMaker && (
            <EditWorkForm
              work={targetWork}
              currentMakerId={selectedMaker.id}
              makers={makers}
              onSubmit={(product, quantity, date, targetMakerId, totalPrice) =>
                updateWork(targetWork.id, product, quantity, date, targetMakerId, totalPrice)
              }
              onCancel={() => {
                setModal(null);
                setTargetWorkId(null);
              }}
            />
          )}
          {modal === "delete-work" && targetWork && (
            <ConfirmDeleteWorkModal
              work={targetWork}
              isHistory={Boolean(targetWork.completedAt)}
              onConfirm={() => deleteWork(targetWork.id)}
              onCancel={() => {
                setModal(null);
                setTargetWorkId(null);
              }}
            />
          )}
          {modal === "bulk-payment" && bulkPaymentMaker && (
            <BulkPaymentForm
              maker={bulkPaymentMaker}
              onSubmit={(amount, date, note) => addBulkMakerPayment(bulkPaymentMaker.id, amount, date, note)}
              onCancel={() => {
                setModal(null);
                setBulkPaymentMakerId(null);
              }}
            />
          )}
          {modal === "log" && (
            <LogForm
              onSubmit={addLog}
              onCancel={() => {
                setModal(null);
                setTargetWorkId(null);
              }}
            />
          )}
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

function SummaryCard({
  icon,
  label,
  value,
  note,
  tone,
  className = "",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  tone: "indigo" | "blue" | "green" | "rose";
  className?: string;
}) {
  const styles = {
    indigo: "bg-indigo-50 text-indigo-600",
    blue: "bg-sky-50 text-sky-600",
    green: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-600",
  }[tone];
  return (
    <div className={`rounded-2xl border border-line/80 bg-white p-4 shadow-card sm:p-5 ${className}`}>
      <div className="flex items-start justify-between">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${styles}`}>{icon}</div>
        <MoreHorizontal size={18} className="text-slate-300" />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="text-xl font-bold tracking-tight text-ink sm:text-2xl">{value}</p>
        <p className="text-xs font-medium text-slate-500">{label}</p>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">{note}</p>
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
  tint,
  className = "",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tint: "indigo" | "emerald" | "rose";
  className?: string;
}) {
  const tintStyles = {
    indigo: "bg-indigo-50 text-brand-600",
    emerald: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-600",
  }[tint];
  return (
    <div className={`flex items-center gap-3 rounded-xl border border-line/80 bg-white px-3.5 py-3 shadow-card ${className}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tintStyles}`}>{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-[11px] text-slate-400">{label}</p>
        <p className="mt-0.5 truncate text-sm font-bold text-ink">{value}</p>
      </div>
    </div>
  );
}

function WorkCard({
  work,
  isHistory,
  onAddLog,
  onEditWork,
  onDeleteWork,
  onUpdateLog,
  onAddTask,
  onToggleTask,
  onUpdateTask,
  onDeleteTask,
  onAddPayment,
  onDeletePayment,
  onCloseRemainingBalance,
  onComplete,
}: {
  work: WorkOrder;
  isHistory: boolean;
  onAddLog: () => void;
  onEditWork: () => void;
  onDeleteWork: () => void;
  onUpdateLog: (logId: string, note: string, date: string) => void;
  onAddTask: (text: string) => void;
  onToggleTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, text: string) => void;
  onDeleteTask: (taskId: string) => void;
  onAddPayment: (amount: number, date: string, note?: string) => void;
  onDeletePayment: (paymentId: string) => void;
  onCloseRemainingBalance: () => void;
  onComplete: () => void;
}) {
  const sortedLogs = [...work.logs].sort((a, b) => a.date.localeCompare(b.date));
  const tasks = work.tasks ?? [];
  const pendingTaskCount = tasks.filter((task) => !task.completed).length;
  const payments = [...(work.payments ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const { totalPrice, paidAmount, remainingDebt, status: paymentStatus } = getWorkFinance(work);

  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editingLogNote, setEditingLogNote] = useState("");
  const [editingLogDate, setEditingLogDate] = useState("");

  const [newTaskText, setNewTaskText] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskText, setEditingTaskText] = useState("");

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayString());
  const [paymentNote, setPaymentNote] = useState("");

  function startEditingLog(log: LogEntry) {
    setEditingLogId(log.id);
    setEditingLogNote(log.note);
    setEditingLogDate(log.date);
  }

  function cancelEditingLog() {
    setEditingLogId(null);
    setEditingLogNote("");
    setEditingLogDate("");
  }

  function saveEditedLog(event: FormEvent<HTMLFormElement>, logId: string) {
    event.preventDefault();
    if (!editingLogNote.trim()) return;
    onUpdateLog(logId, editingLogNote, editingLogDate);
    cancelEditingLog();
  }

  function handleAddTaskSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newTaskText.trim()) return;
    onAddTask(newTaskText);
    setNewTaskText("");
  }

  function startEditingTask(task: WorkTask) {
    setEditingTaskId(task.id);
    setEditingTaskText(task.text);
  }

  function cancelEditingTask() {
    setEditingTaskId(null);
    setEditingTaskText("");
  }

  function saveEditedTask(event: FormEvent<HTMLFormElement>, taskId: string) {
    event.preventDefault();
    if (!editingTaskText.trim()) return;
    onUpdateTask(taskId, editingTaskText);
    cancelEditingTask();
  }

  function handleAddPaymentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = Number(paymentAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return;
    onAddPayment(parsedAmount, paymentDate, paymentNote);
    setPaymentAmount("");
    setPaymentNote("");
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-line/80 bg-white shadow-card">
      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isHistory ? "bg-emerald-50 text-emerald-600" : "bg-indigo-50 text-brand-600"}`}>
              {isHistory ? <CheckCircle2 size={19} /> : <Shirt size={19} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate font-bold text-ink">{work.product}</h3>
                {!isHistory && pendingTaskCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/80 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 shadow-sm">
                    ⚠️ {pendingTaskCount} Görev Bekliyor
                  </span>
                )}
                {paymentStatus === "unpaid" && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-700">
                    Ödeme Bekliyor
                  </span>
                )}
                {paymentStatus === "partial" && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                    Kısmi Ödendi
                  </span>
                )}
                {paymentStatus === "paid" && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                    <Check size={11} /> Ödendi
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                <span className="flex items-center gap-1"><CalendarDays size={13} /> {formatDate(work.date, { day: "numeric", month: "short", year: "numeric" })}</span>
                <span className="flex items-center gap-1"><PackageCheck size={13} /> {work.quantity.toLocaleString("tr-TR")} adet</span>
                {totalPrice > 0 && (
                  <span className="flex items-center gap-1 font-semibold text-slate-600">
                    <Banknote size={13} className="text-brand-600" /> {formatCurrency(totalPrice)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${isHistory ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              {isHistory ? "Tamamlandı" : "Devam ediyor"}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onEditWork}
                title="İşi düzenle"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 text-xs font-semibold text-slate-600 transition hover:border-brand-200 hover:bg-brand-50/60 hover:text-brand-700"
              >
                <Pencil size={13} />
                <span>Düzenle</span>
              </button>
              <button
                type="button"
                onClick={onDeleteWork}
                title={isHistory ? "Geçmiş kaydı sil" : "Aktif işi sil"}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-100 bg-rose-50/50 px-2.5 text-xs font-semibold text-rose-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
              >
                <Trash2 size={13} />
                <span>Sil</span>
              </button>
            </div>
          </div>
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

      {/* Fason Ücret ve Ödeme Takip Sistemi (Finans) */}
      <div className="border-t border-line/80 bg-emerald-50/20 px-4 py-4 sm:px-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
            <Wallet size={15} className="text-emerald-600" />
            Ücret ve Ödeme Takibi (Finans)
          </p>
          <div className="flex items-center gap-2">
            {remainingDebt > 0 && (
              <button
                type="button"
                onClick={onCloseRemainingBalance}
                className="inline-flex h-7 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-emerald-700"
              >
                <Check size={12} /> Kalan Bakiyeyi Kapat ({formatCurrency(remainingDebt)})
              </button>
            )}
          </div>
        </div>

        <div className="mb-3 grid grid-cols-3 gap-2.5">
          <div className="rounded-xl border border-line/80 bg-white px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Toplam Tutar</p>
            <p className="mt-0.5 text-sm font-bold text-ink">{formatCurrency(totalPrice)}</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-white px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">Ödenen</p>
            <p className="mt-0.5 text-sm font-bold text-emerald-700">{formatCurrency(paidAmount)}</p>
          </div>
          <div className={`rounded-xl border px-3 py-2.5 ${remainingDebt > 0 ? "border-rose-200 bg-rose-50/40" : "border-emerald-100 bg-white"}`}>
            <p className={`text-[10px] font-semibold uppercase tracking-wide ${remainingDebt > 0 ? "text-rose-600" : "text-slate-400"}`}>Kalan Borç</p>
            <p className={`mt-0.5 text-sm font-bold ${remainingDebt > 0 ? "text-rose-700" : "text-emerald-700"}`}>
              {formatCurrency(remainingDebt)}
            </p>
          </div>
        </div>

        <form onSubmit={handleAddPaymentSubmit} className="mb-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={paymentAmount}
            onChange={(event) => setPaymentAmount(event.target.value)}
            placeholder="Ödeme tutarı (₺)"
            className="h-9 rounded-xl border border-line bg-white px-3 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 sm:w-36"
          />
          <input
            type="text"
            maxLength={100}
            value={paymentNote}
            onChange={(event) => setPaymentNote(event.target.value)}
            placeholder="Not (İsteğe bağlı: Nakit, EFT vb.)"
            className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          <input
            type="date"
            required
            value={paymentDate}
            onChange={(event) => setPaymentDate(event.target.value)}
            className="h-9 rounded-xl border border-line bg-white px-2.5 text-xs text-slate-600 outline-none focus:border-brand-400 sm:w-36"
          />
          <button
            type="submit"
            disabled={!paymentAmount || Number(paymentAmount) <= 0}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={14} strokeWidth={2.4} /> Ödeme Ekle
          </button>
        </form>

        {payments.length > 0 ? (
          <div className="space-y-1.5">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-line/70 bg-white px-3 py-2 text-xs"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-bold text-emerald-700">+{formatCurrency(payment.amount)}</span>
                  {payment.note && <span className="truncate text-slate-600">· {payment.note}</span>}
                  <span className="text-[11px] text-slate-400">({formatDate(payment.date, { day: "numeric", month: "short", year: "numeric" })})</span>
                </div>
                <button
                  type="button"
                  onClick={() => onDeletePayment(payment.id)}
                  title="Ödemeyi sil"
                  aria-label="Ödemeyi sil"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-slate-400">
            {totalPrice > 0
              ? "Bu iş için henüz ödeme girişi yapılmadı."
              : "İş tutarı belirlemek için üstteki “Düzenle” butonunu kullanabilir veya doğrudan ödeme ekleyebilirsiniz."}
          </p>
        )}
      </div>

      {/* Eksik Malzeme / Görev (To-Do) Takip Sistemi */}
      {(!isHistory || tasks.length > 0) && (
        <div className="border-t border-line/80 bg-amber-50/25 px-4 py-4 sm:px-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <ListTodo size={15} className="text-amber-600" />
              Eksik Malzeme / Görev Takibi
            </p>
            <div className="flex items-center gap-1.5">
              {pendingTaskCount > 0 ? (
                <span className="rounded-md bg-amber-100/80 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                  {pendingTaskCount} bekliyor
                </span>
              ) : tasks.length > 0 ? (
                <span className="rounded-md bg-emerald-100/80 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  Tümü tamamlandı
                </span>
              ) : null}
              <span className="rounded-md bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-400 shadow-sm">
                {tasks.filter((t) => t.completed).length}/{tasks.length}
              </span>
            </div>
          </div>

          {!isHistory && (
            <form onSubmit={handleAddTaskSubmit} className="mb-3 flex gap-2">
              <input
                type="text"
                maxLength={160}
                value={newTaskText}
                onChange={(event) => setNewTaskText(event.target.value)}
                placeholder="Örn: Biye götürülecek, çıtçıt verilecek, etiket eksik..."
                className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
              <button
                type="submit"
                disabled={!newTaskText.trim()}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={14} strokeWidth={2.4} /> Ekle
              </button>
            </form>
          )}

          {tasks.length > 0 ? (
            <ul className="space-y-2">
              {tasks.map((task) => (
                <li
                  key={task.id}
                  className={`flex items-center justify-between gap-2.5 rounded-xl border px-3 py-2.5 transition ${
                    task.completed
                      ? "border-line/60 bg-white/60 text-slate-400"
                      : "border-amber-200/70 bg-white text-slate-700 shadow-sm"
                  }`}
                >
                  {editingTaskId === task.id ? (
                    <form
                      onSubmit={(event) => saveEditedTask(event, task.id)}
                      className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:flex-nowrap"
                    >
                      <input
                        autoFocus
                        type="text"
                        maxLength={160}
                        value={editingTaskText}
                        onChange={(event) => setEditingTaskText(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") cancelEditingTask();
                        }}
                        className="h-8 min-w-0 flex-1 rounded-lg border border-brand-300 bg-white px-2.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-brand-100"
                      />
                      <div className="flex items-center gap-1.5">
                        <button
                          type="submit"
                          className="rounded-lg bg-brand-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-brand-700"
                        >
                          Kaydet
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditingTask}
                          className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                        >
                          Vazgeç
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={task.completed}
                          onChange={() => onToggleTask(task.id)}
                          className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-brand-600"
                        />
                        <span
                          className={`break-words text-xs font-medium leading-5 ${
                            task.completed ? "line-through text-slate-400" : "text-slate-700"
                          }`}
                        >
                          {task.text}
                        </span>
                      </label>
                      {!isHistory && (
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => startEditingTask(task)}
                            title="Görevi düzenle"
                            aria-label="Görevi düzenle"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-brand-600"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteTask(task.id)}
                            title="Görevi sil"
                            aria-label="Görevi sil"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white/70 px-3 py-2.5 text-xs text-slate-400">
              <ListTodo size={14} /> Henüz eksik malzeme veya görev eklenmedi.
            </div>
          )}
        </div>
      )}

      {/* Teslimat Günlüğü (Notlar) */}
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
                  {editingLogId === log.id ? (
                    <form onSubmit={(event) => saveEditedLog(event, log.id)} className="space-y-2.5">
                      <textarea
                        autoFocus
                        required
                        maxLength={500}
                        rows={2}
                        value={editingLogNote}
                        onChange={(event) => setEditingLogNote(event.target.value)}
                        className="w-full rounded-xl border border-brand-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-brand-100"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <input
                          required
                          type="date"
                          value={editingLogDate}
                          onChange={(event) => setEditingLogDate(event.target.value)}
                          className="h-8 rounded-lg border border-line bg-white px-2.5 text-xs text-slate-600 outline-none focus:border-brand-400"
                        />
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={cancelEditingLog}
                            className="h-8 rounded-lg border border-line bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                          >
                            Vazgeç
                          </button>
                          <button
                            type="submit"
                            className="h-8 rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white transition hover:bg-brand-700"
                          >
                            Kaydet
                          </button>
                        </div>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <p className=" whitespace-pre-wrap break-words text-sm leading-5 text-slate-700">{log.note}</p>
                        {!isHistory && (
                          <button
                            type="button"
                            onClick={() => startEditingLog(log)}
                            title="Notu düzenle"
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-400 transition hover:bg-brand-50 hover:text-brand-700"
                          >
                            <Pencil size={12} />
                            <span>Notu düzenle</span>
                          </button>
                        )}
                      </div>
                      <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-slate-400"><Clock3 size={12} /> {formatDate(log.date)}</p>
                    </>
                  )}
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

function WorkForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (product: string, quantity: number, date: string, totalPrice?: number) => void;
  onCancel: () => void;
}) {
  const [product, setProduct] = useState("");
  const [quantity, setQuantity] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [date, setDate] = useState(todayString());
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedQuantity = Number(quantity);
    const parsedTotalPrice = totalPrice.trim() ? Number(totalPrice) : undefined;
    if (
      product.trim() &&
      Number.isInteger(parsedQuantity) &&
      parsedQuantity > 0 &&
      (parsedTotalPrice === undefined || (Number.isFinite(parsedTotalPrice) && parsedTotalPrice >= 0))
    ) {
      onSubmit(product, parsedQuantity, date, parsedTotalPrice);
    }
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
        <Field label="Toplam Tutar (₺)" hint="İsteğe bağlı">
          <input
            type="number"
            min="0"
            step="0.01"
            value={totalPrice}
            onChange={(event) => setTotalPrice(event.target.value)}
            placeholder="Örn. 25000"
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Veriliş tarihi" required>
        <input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} />
      </Field>
      <FormActions onCancel={onCancel} submitLabel="İşi oluştur" />
    </form>
  );
}

function EditWorkForm({
  work,
  currentMakerId,
  makers,
  onSubmit,
  onCancel,
}: {
  work: WorkOrder;
  currentMakerId: string;
  makers: Maker[];
  onSubmit: (product: string, quantity: number, date: string, targetMakerId: string, totalPrice?: number) => void;
  onCancel: () => void;
}) {
  const [product, setProduct] = useState(work.product);
  const [quantity, setQuantity] = useState(String(work.quantity));
  const [totalPrice, setTotalPrice] = useState(work.totalPrice !== undefined ? String(work.totalPrice) : "");
  const [date, setDate] = useState(work.date);
  const [makerId, setMakerId] = useState(currentMakerId);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedQuantity = Number(quantity);
    const parsedTotalPrice = totalPrice.trim() ? Number(totalPrice) : undefined;
    if (
      product.trim() &&
      Number.isInteger(parsedQuantity) &&
      parsedQuantity > 0 &&
      makerId &&
      (parsedTotalPrice === undefined || (Number.isFinite(parsedTotalPrice) && parsedTotalPrice >= 0))
    ) {
      onSubmit(product, parsedQuantity, date, makerId, parsedTotalPrice);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Ürün / model adı" required>
        <input
          autoFocus
          required
          maxLength={80}
          value={product}
          onChange={(event) => setProduct(event.target.value)}
          placeholder="Örn. Pamuklu bebek tulumu"
          className={inputClass}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Toplam adet" required>
          <input
            required
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            placeholder="500"
            className={inputClass}
          />
        </Field>
        <Field label="Toplam Tutar (₺)" hint="İsteğe bağlı">
          <input
            type="number"
            min="0"
            step="0.01"
            value={totalPrice}
            onChange={(event) => setTotalPrice(event.target.value)}
            placeholder="Örn. 25000"
            className={inputClass}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Veriliş tarihi" required>
          <input
            required
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Fasoncu / Atölye" required>
          <select
            value={makerId}
            onChange={(event) => setMakerId(event.target.value)}
            className={inputClass}
          >
            {makers.map((maker) => (
              <option key={maker.id} value={maker.id}>
                {maker.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <FormActions onCancel={onCancel} submitLabel="Değişiklikleri kaydet" />
    </form>
  );
}

function BulkPaymentForm({
  maker,
  onSubmit,
  onCancel,
}: {
  maker: Maker;
  onSubmit: (amount: number, date: string, note?: string) => void;
  onCancel: () => void;
}) {
  const finance = getMakerFinance(maker);
  const [amount, setAmount] = useState(finance.remainingDebt > 0 ? String(finance.remainingDebt) : "");
  const [date, setDate] = useState(todayString());
  const [note, setNote] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= finance.remainingDebt) {
      onSubmit(parsedAmount, date, note);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3.5 py-3 text-xs leading-5 text-emerald-900">
        <p className="font-bold">{maker.name} — Cari Özet</p>
        <p className="mt-0.5 text-emerald-800">
          Toplam Kalan Borç: <strong>{formatCurrency(finance.remainingDebt)}</strong>. Girilen toplu ödeme, en eski tarihli borçlu işten başlayarak otomatik düşülür.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ödeme tutarı (₺)" required>
          <input
            autoFocus
            required
            type="number"
            min="0.01"
            max={finance.remainingDebt}
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="Örn. 15000"
            className={inputClass}
          />
        </Field>
        <Field label="Ödeme tarihi" required>
          <input
            required
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Açıklama / Not" hint="İsteğe bağlı">
        <input
          type="text"
          maxLength={100}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Örn. Havale / Nakit toplu ödeme"
          className={inputClass}
        />
      </Field>
      <FormActions onCancel={onCancel} submitLabel="Toplu ödemeyi kaydet" />
    </form>
  );
}

function ConfirmDeleteWorkModal({
  work,
  isHistory,
  onConfirm,
  onCancel,
}: {
  work: WorkOrder;
  isHistory: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-rose-100 bg-rose-50/70 p-3.5 text-rose-800">
        <AlertTriangle size={20} className="mt-0.5 shrink-0 text-rose-600" />
        <div className="text-xs leading-5">
          <p className="font-bold text-rose-900">
            {isHistory
              ? "Geçmiş kaydı kalıcı olarak silmek istiyor musunuz?"
              : "Bu aktif işi silmek istediğinize emin misiniz?"}
          </p>
          <p className="mt-1 text-rose-700">
            <strong>{work.product}</strong> ({work.quantity.toLocaleString("tr-TR")} adet) kaydı ve içindeki tüm teslimat notları kalıcı olarak kaldırılacaktır.
          </p>
        </div>
      </div>
      <div className="flex gap-2.5 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-11 flex-1 rounded-xl border border-line text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          Vazgeç
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="h-11 flex-1 rounded-xl bg-rose-600 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 active:scale-[0.99]"
        >
          Evet, Sil
        </button>
      </div>
    </div>
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
